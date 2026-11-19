; Étapes ajoutées à l'installeur NSIS de Tauri (bundle > windows > nsis > installerHooks).
; Tauri insère ces macros à des moments précis, sans qu'on réécrive son modèle.

; Après la désinstallation : retirer le lancement avec Windows.
; Le réglage « Lancer Kernshine au démarrage de Windows » écrit une valeur
; « Kernshine » (le productName) sous ...\CurrentVersion\Run, et une seconde
; sous ...\StartupApproved\Run (interrupteur du Gestionnaire des tâches).
; D'ordinaire dans le registre de l'utilisateur, mais dans celui de la machine
; si l'app a été lancée en administrateur : on nettoie les deux.
; Jamais pendant une mise à jour ($UpdateMode), sinon chaque mise à jour
; désactiverait le lancement avec Windows.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCTNAME}"
    ; L'installeur est un programme 32 bits : sans SetRegView 64, HKLM pointerait
    ; vers la copie 32 bits du registre (Wow6432Node), où l'app n'écrit pas.
    SetRegView 64
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCTNAME}"
    SetRegView lastused
  ${EndIf}
!macroend
