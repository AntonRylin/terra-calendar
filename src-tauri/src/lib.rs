use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

// CalDAV (and later other) account secrets are stored in the OS keychain
// (Windows Credential Manager / macOS Keychain), keyed by account identifier.
// They never touch the repo, localStorage, or any config file.
const KEYCHAIN_SERVICE: &str = "open-calendar-caldav";

const GOOGLE_AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OAuthResult {
  code: String,
  state: String,
  redirect_uri: String,
}

/// Run the Google installed-app OAuth flow: bind a loopback listener on an
/// ephemeral port, open the system browser at the consent screen, and wait for
/// Google to redirect back with the authorization code. PKCE means no secret is
/// involved; the code is exchanged for tokens on the JS side.
#[tauri::command]
async fn google_oauth(
  client_id: String,
  scope: String,
  code_challenge: String,
  state: String,
) -> Result<OAuthResult, String> {
  tauri::async_runtime::spawn_blocking(move || {
    run_loopback(client_id, scope, code_challenge, state)
  })
  .await
  .map_err(|e| e.to_string())?
}

fn run_loopback(
  client_id: String,
  scope: String,
  code_challenge: String,
  state: String,
) -> Result<OAuthResult, String> {
  let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
  let port = listener.local_addr().map_err(|e| e.to_string())?.port();
  let redirect_uri = format!("http://127.0.0.1:{port}");

  let auth_url = url::Url::parse_with_params(
    GOOGLE_AUTH_ENDPOINT,
    &[
      ("client_id", client_id.as_str()),
      ("redirect_uri", redirect_uri.as_str()),
      ("response_type", "code"),
      ("scope", scope.as_str()),
      ("code_challenge", code_challenge.as_str()),
      ("code_challenge_method", "S256"),
      ("state", state.as_str()),
      ("access_type", "offline"),
      ("prompt", "consent"),
    ],
  )
  .map_err(|e| e.to_string())?;

  open::that(auth_url.as_str()).map_err(|e| format!("Failed to open browser: {e}"))?;

  listener.set_nonblocking(true).map_err(|e| e.to_string())?;
  let deadline = Instant::now() + Duration::from_secs(300);

  loop {
    if Instant::now() > deadline {
      return Err("Timed out waiting for Google authorization.".into());
    }
    match listener.accept() {
      Ok((mut stream, _)) => return handle_redirect(&mut stream, port, redirect_uri),
      Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
        std::thread::sleep(Duration::from_millis(100));
      }
      Err(e) => return Err(e.to_string()),
    }
  }
}

fn handle_redirect(
  stream: &mut std::net::TcpStream,
  port: u16,
  redirect_uri: String,
) -> Result<OAuthResult, String> {
  let mut buf = [0u8; 8192];
  let n = stream.read(&mut buf).unwrap_or(0);
  let request = String::from_utf8_lossy(&buf[..n]);
  let path = request
    .lines()
    .next()
    .and_then(|line| line.split_whitespace().nth(1))
    .unwrap_or("/");
  let parsed =
    url::Url::parse(&format!("http://127.0.0.1:{port}{path}")).map_err(|e| e.to_string())?;

  let mut code = None;
  let mut got_state = None;
  let mut error = None;
  for (key, value) in parsed.query_pairs() {
    match key.as_ref() {
      "code" => code = Some(value.into_owned()),
      "state" => got_state = Some(value.into_owned()),
      "error" => error = Some(value.into_owned()),
      _ => {}
    }
  }

  let body = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Terra Calendar</title></head>\
<body style=\"font-family:system-ui,-apple-system,sans-serif;text-align:center;padding-top:3rem;color:#222\">\
<h2>Terra Calendar</h2><p>Authorization complete — you can close this tab and return to the app.</p></body></html>";
  let response = format!(
    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
    body.len(),
    body
  );
  let _ = stream.write_all(response.as_bytes());
  let _ = stream.flush();

  if let Some(err) = error {
    return Err(format!("Google authorization was denied: {err}"));
  }
  match (code, got_state) {
    (Some(code), Some(state)) => Ok(OAuthResult { code, state, redirect_uri }),
    _ => Err("Google did not return an authorization code.".into()),
  }
}

/// Open an https URL in the system browser (e.g. Stripe Checkout). Navigating
/// the webview itself away from the app is never what we want on desktop.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
  let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
  if parsed.scheme() != "https" {
    return Err("Only https URLs can be opened externally.".into());
  }
  open::that(parsed.as_str()).map_err(|e| format!("Failed to open browser: {e}"))
}

/// Ask the user where to put a text file (native "Save as" dialog), then write
/// it there. Returns the chosen path, or `None` if the dialog was dismissed.
///
/// The write happens here rather than through the fs plugin so the app doesn't
/// need a filesystem scope wider than its own app-data directory: the only path
/// ever written is the one the user just picked in the dialog.
#[tauri::command]
async fn save_text_file(
  app: tauri::AppHandle,
  default_name: String,
  contents: String,
  filter_name: Option<String>,
  extension: Option<String>,
) -> Result<Option<String>, String> {
  let extension = extension.unwrap_or_else(|| "txt".into());
  let filter_name = filter_name.unwrap_or_else(|| extension.to_uppercase());

  // The dialog blocks until the user picks a path, so it goes on a blocking
  // thread: never the main thread (which has to keep pumping the dialog's own
  // events) and never an async worker.
  tauri::async_runtime::spawn_blocking(move || {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
      .dialog()
      .file()
      .set_file_name(&default_name)
      .add_filter(&filter_name, &[extension.as_str()])
      .blocking_save_file();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| format!("Couldn't write the file: {e}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
  })
  .await
  .map_err(|e| format!("The save dialog failed: {e}"))?
}

#[tauri::command]
fn save_credential(account: String, secret: String) -> Result<(), String> {
  let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &account).map_err(|e| e.to_string())?;
  entry.set_password(&secret).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_credential(account: String) -> Result<Option<String>, String> {
  let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &account).map_err(|e| e.to_string())?;
  match entry.get_password() {
    Ok(p) => Ok(Some(p)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn delete_credential(account: String) -> Result<(), String> {
  let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &account).map_err(|e| e.to_string())?;
  match entry.delete_credential() {
    Ok(()) => Ok(()),
    Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();

  // Single-instance must be the FIRST plugin so it can bail out of secondary
  // launches before anything else initialises. Its "deep-link" feature hands
  // any opencalendar:// URL in the second instance's argv to the deep-link
  // plugin, so browser sign-in reaches the already-running window.
  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.unminimize();
      let _ = window.set_focus();
    }
  }));

  builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_notification::init())
    .invoke_handler(tauri::generate_handler![
      save_credential,
      get_credential,
      delete_credential,
      google_oauth,
      open_external,
      save_text_file
    ])
    .setup(|app| {
      #[cfg(not(any(target_os = "android", target_os = "ios")))]
      {
        app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
        app.handle().plugin(tauri_plugin_process::init())?;
      }
      // NSIS/MSI installs register the opencalendar:// scheme from
      // tauri.conf.json; runtime registration covers dev builds, portable
      // builds and Linux AppImages (HKCU / .desktop entries — no admin).
      #[cfg(any(windows, target_os = "linux"))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        let _ = app.deep_link().register_all();
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
