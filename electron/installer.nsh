!macro customInit
  nsExec::ExecToStack 'taskkill /IM "TPV MultiShop.exe" /T'
  Pop $0
  Pop $1
  Sleep 500
  nsExec::ExecToStack 'taskkill /F /IM "TPV MultiShop.exe" /T'
  Pop $0
  Pop $1
  Sleep 1000
!macroend
