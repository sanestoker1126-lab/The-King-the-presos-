# Local HTTP server using Windows PowerShell (no Node/Python).
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$rootPrefix = $root.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 8765)
try { $listener.Start() } catch {
  Write-Host 'El puerto 8765 esta ocupado. Cierra la otra ventana del juego.' -ForegroundColor Red
  Read-Host 'Pulsa Enter para salir'
  exit 1
}
Write-Host 'Juego iniciado: http://127.0.0.1:8765/' -ForegroundColor Green
Write-Host 'No cierres esta ventana mientras juegas.'
Start-Process 'http://127.0.0.1:8765/'
$mime = @{
 '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'
 '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'
 '.webp'='image/webp'; '.png'='image/png'; '.jpg'='image/jpeg'
 '.jpeg'='image/jpeg'; '.svg'='image/svg+xml'; '.ogg'='audio/ogg'
 '.mp3'='audio/mpeg'; '.wav'='audio/wav'; '.woff'='font/woff'
 '.woff2'='font/woff2'; '.ico'='image/x-icon'
}
$crlf = [string][char]13 + [string][char]10
try {
 while ($true) {
  $client = $listener.AcceptTcpClient()
  $reader = $null
  try {
   $stream = $client.GetStream()
   $reader = [System.IO.StreamReader]::new($stream,[System.Text.Encoding]::ASCII,$false,1024,$true)
   $line = $reader.ReadLine()
   if (-not $line) { continue }
   while ($true) { $h=$reader.ReadLine(); if ($null -eq $h -or $h -eq '') { break } }
   $parts = $line.Split(' ')
   $method = $parts[0]
   $status = '200 OK'
   $type = 'text/plain; charset=utf-8'
   $bytes = [byte[]]@()
   if ($method -ne 'GET' -and $method -ne 'HEAD') { $status='405 Method Not Allowed' }
   else {
    $urlPath=[System.Uri]::UnescapeDataString($parts[1].Split('?')[0]).Replace('/','\')
    if ($urlPath -eq '\') { $urlPath='\index.html' }
    $candidate=[System.IO.Path]::GetFullPath((Join-Path $root ($urlPath.TrimStart('\'))))
    if (-not $candidate.StartsWith($rootPrefix,[System.StringComparison]::OrdinalIgnoreCase)) { $status='403 Forbidden' }
    elseif (Test-Path -LiteralPath $candidate -PathType Leaf) {
     $bytes=[System.IO.File]::ReadAllBytes($candidate)
     $ext=[System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
     if ($mime.ContainsKey($ext)) { $type=$mime[$ext] }
     else { $type='application/octet-stream' }
    } else { $status='404 Not Found' }
   }
   if ($status -ne '200 OK') { $bytes=[System.Text.Encoding]::UTF8.GetBytes($status) }
   $header=(@("HTTP/1.1 $status","Content-Type: $type","Content-Length: $($bytes.Length)","Cache-Control: no-store","X-Content-Type-Options: nosniff","Connection: close","") -join $crlf) + $crlf
   $headerBytes=[System.Text.Encoding]::ASCII.GetBytes($header)
   $stream.Write($headerBytes,0,$headerBytes.Length)
   if ($method -ne 'HEAD' -and $bytes.Length -gt 0) { $stream.Write($bytes,0,$bytes.Length) }
  } catch {
   Write-Host "Solicitud fallida: $($_.Exception.Message)"
  } finally {
   if ($reader) { $reader.Dispose() }
   $client.Close()
  }
 }
} finally { $listener.Stop() }
