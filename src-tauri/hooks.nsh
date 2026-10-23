!macro NSIS_HOOK_POSTINSTALL
  CopyFiles "$INSTDIR\target\release\WebView2Loader.dll" "$INSTDIR\WebView2Loader.dll"
  Delete "$INSTDIR\target\release\WebView2Loader.dll"
  RMDir "$INSTDIR\target\release"
  RMDir "$INSTDIR\target"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\WebView2Loader.dll"
!macroend
