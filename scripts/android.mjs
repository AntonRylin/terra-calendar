// Runs `tauri android <args>` for Terra Calendar.
//
// Two things the plain Tauri CLI can't do on its own here:
// 1. Android needs the Rust crate built as a `cdylib`, but on the Windows GNU
//    toolchain a cdylib overflows the PE export table, so Cargo.toml keeps
//    `crate-type = ["lib"]` for desktop. This script switches it for the
//    Android build and always puts it back afterwards.
// 2. It finds a JDK (JAVA_HOME or Android Studio's bundled jbr), the Android
//    SDK (ANDROID_HOME or the default location) and a complete NDK.
//
// Usage: node scripts/android.mjs build --debug --apk --target x86_64
//        node scripts/android.mjs dev
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const cargoToml = new URL('../src-tauri/Cargo.toml', import.meta.url);
const DESKTOP = 'crate-type = ["lib"]';
const MOBILE = 'crate-type = ["staticlib", "cdylib", "rlib"]';

function firstExisting(paths) {
  return paths.find((p) => p && existsSync(p));
}

const env = { ...process.env };
const isWin = process.platform === 'win32';
const localAppData = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');

env.ANDROID_HOME ||= firstExisting([
  env.ANDROID_SDK_ROOT,
  isWin ? join(localAppData, 'Android', 'Sdk') : null,
  join(homedir(), 'Library', 'Android', 'sdk'),
  join(homedir(), 'Android', 'Sdk'),
]);
if (!env.ANDROID_HOME) {
  console.error('Android SDK not found. Install Android Studio or set ANDROID_HOME.');
  process.exit(1);
}

env.JAVA_HOME ||= firstExisting([
  isWin ? 'C:\\Program Files\\Android\\Android Studio\\jbr' : null,
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  '/opt/android-studio/jbr',
]);

// Newest NDK that is actually complete (a failed download leaves a folder
// without source.properties, and the Tauri CLI would pick it).
if (!env.NDK_HOME) {
  const ndkDir = join(env.ANDROID_HOME, 'ndk');
  const versions = existsSync(ndkDir)
    ? readdirSync(ndkDir).filter((v) => existsSync(join(ndkDir, v, 'source.properties')))
    : [];
  versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (versions[0]) env.NDK_HOME = join(ndkDir, versions[0]);
}

const original = readFileSync(cargoToml, 'utf8');
if (!original.includes(DESKTOP)) {
  console.error(`Expected ${DESKTOP} in src-tauri/Cargo.toml.`);
  process.exit(1);
}
writeFileSync(cargoToml, original.replace(DESKTOP, MOBILE));
const restore = () => writeFileSync(cargoToml, original);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { restore(); process.exit(1); });

const args = process.argv.slice(2);
const started = Date.now();
let status = 1;
try {
  const result = spawnSync('npx', ['tauri', 'android', ...args], { stdio: 'inherit', env, shell: isWin });
  status = result.status ?? 1;
  if (status !== 0 && isWin && args[0] === 'build') status = gradleFallback(args);
} finally {
  restore();
}
process.exit(status);

// The Tauri CLI links the built Rust library into jniLibs with a symlink,
// which Windows refuses unless Developer Mode is on. If the Rust build
// itself succeeded, copy the library instead and run Gradle without its Rust
// step, which produces the same APK.
function gradleFallback(argv) {
  const TARGETS = {
    aarch64: { triple: 'aarch64-linux-android', abi: 'arm64-v8a', arch: 'Arm64' },
    armv7: { triple: 'armv7-linux-androideabi', abi: 'armeabi-v7a', arch: 'Arm' },
    i686: { triple: 'i686-linux-android', abi: 'x86', arch: 'X86' },
    x86_64: { triple: 'x86_64-linux-android', abi: 'x86_64', arch: 'X86_64' },
  };
  const targets = [];
  argv.forEach((a, i) => {
    if (a === '--target' || a === '-t') targets.push(argv[i + 1]);
  });
  if (!targets.length) targets.push(...Object.keys(TARGETS));
  const profile = argv.includes('--debug') ? 'debug' : 'release';
  const Profile = profile === 'debug' ? 'Debug' : 'Release';
  const srcTauri = new URL('../src-tauri/', import.meta.url);
  const androidDir = new URL('gen/android/', srcTauri);

  for (const t of targets) {
    const info = TARGETS[t];
    if (!info) return 1;
    const lib = new URL(`target/${info.triple}/${profile}/libapp_lib.so`, srcTauri);
    if (!existsSync(lib) || statSync(lib).mtimeMs < started - 1000) return 1; // Rust build really failed
    const dest = new URL(`app/src/main/jniLibs/${info.abi}/`, androidDir);
    mkdirSync(dest, { recursive: true });
    copyFileSync(lib, new URL('libapp_lib.so', dest));
  }

  console.log('\nSymlinks are not allowed here: copied the Rust library and running Gradle directly.\n');
  const single = targets.length === 1 ? TARGETS[targets[0]].arch : 'Universal';
  const bundle = argv.includes('--aab') ? 'bundle' : 'assemble';
  const skip = [`rustBuild${single}${Profile}`, ...targets.map((t) => `rustBuild${TARGETS[t].arch}${Profile}`)];
  const gradleArgs = [`${bundle}${single}${Profile}`, ...[...new Set(skip)].flatMap((task) => ['-x', task]), '--console=plain'];
  const gradlePath = fileURLToPath(new URL(isWin ? 'gradlew.bat' : 'gradlew', androidDir));
  const gradle = spawnSync(isWin ? `"${gradlePath}"` : gradlePath, gradleArgs, {
    stdio: 'inherit',
    env,
    shell: isWin,
    cwd: fileURLToPath(androidDir),
  });
  if (gradle.status === 0) {
    console.log(`\nBuilt: src-tauri/gen/android/app/build/outputs/${bundle === 'bundle' ? 'bundle' : 'apk'}/`);
  }
  return gradle.status ?? 1;
}
