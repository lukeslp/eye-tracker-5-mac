Get-Process USBPcapCMD -ErrorAction SilentlyContinue | Stop-Process -Force
foreach($i in 1..3){ Unregister-ScheduledTask -TaskName "usbpcap-hub$i" -Confirm:$false -ErrorAction SilentlyContinue }
Get-ChildItem C:\capture\*.pcap | Select Name,Length | Format-Table | Out-String
