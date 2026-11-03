# Start USBPcap on every root hub as SYSTEM so it survives SSH. Stop with stop-capture.ps1.
$exe='C:\Program Files\USBPcap\USBPcapCMD.exe'
$ts=Get-Date -Format yyyyMMdd-HHmmss
foreach($i in 1..3){
  $n="usbpcap-hub$i"
  $a=New-ScheduledTaskAction -Execute $exe -Argument "-d \\.\USBPcap$i -o C:\capture\et5-$ts-hub$i.pcap -A -s 65535 -b 134217728"
  Register-ScheduledTask -TaskName $n -Action $a -User SYSTEM -RunLevel Highest -Force | Out-Null
  Start-ScheduledTask -TaskName $n
}
Start-Sleep 3
Get-Process USBPcapCMD -ErrorAction SilentlyContinue | Select Id,StartTime | Format-Table | Out-String
Get-ChildItem C:\capture\*.pcap | Select Name,Length | Format-Table | Out-String
