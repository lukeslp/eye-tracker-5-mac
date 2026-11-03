# Undo the manual USBPcap install (run as admin)
Remove-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{36FC9E60-C465-11CF-8056-444553540000}' -Name UpperFilters -ErrorAction SilentlyContinue
sc.exe delete USBPcap
Remove-Item C:\Windows\System32\drivers\USBPcap.sys -ErrorAction SilentlyContinue
"USBPcap removed; reboot to finish."
