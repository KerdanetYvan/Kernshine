# Assemble les images de l'installeur (BMP 24 bits, le seul format que NSIS lit).
# Appelé par scripts/icons.mjs, qui fournit les logos déjà dessinés en PNG.
#
#   header.bmp   150 x 57  : bandeau en haut des pages (logo + nom, fond blanc)
#   sidebar.bmp  164 x 314 : colonne de gauche des pages d'accueil et de fin

param(
  [Parameter(Mandatory)] [string] $Lockup,      # PNG carré du logo + nom
  [Parameter(Mandatory)] [int]    $LockupTop,   # bande utile du PNG (en px)
  [Parameter(Mandatory)] [int]    $LockupHeight,
  [Parameter(Mandatory)] [string] $Mark,        # PNG carré du logo seul
  [Parameter(Mandatory)] [string] $OutDir
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-Canvas([int] $w, [int] $h, [string] $hex) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml($hex))
  return @($bmp, $g)
}

# Bandeau : logo + nom centrés, fond blanc comme le haut des pages de l'installeur.
$lockupImg = [System.Drawing.Image]::FromFile($Lockup)
$bmp, $g = New-Canvas 150 57 '#FFFFFF'
$w = 128
$h = [int][math]::Round($w * $LockupHeight / $lockupImg.Width)
$src = New-Object System.Drawing.Rectangle 0, $LockupTop, $lockupImg.Width, $LockupHeight
$dst = New-Object System.Drawing.Rectangle ([int]((150 - $w) / 2)), ([int]((57 - $h) / 2)), $w, $h
$g.DrawImage($lockupImg, $dst, $src, [System.Drawing.GraphicsUnit]::Pixel)
$bmp.Save((Join-Path $OutDir 'header.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose(); $bmp.Dispose(); $lockupImg.Dispose()

# Colonne : le logo sur fond sable (couleur « bg/subtle » de la charte).
$markImg = [System.Drawing.Image]::FromFile($Mark)
$bmp, $g = New-Canvas 164 314 '#F6F0E4'
$size = 112
$g.DrawImage($markImg, [int]((164 - $size) / 2), 56, $size, $size)
$bmp.Save((Join-Path $OutDir 'sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose(); $bmp.Dispose(); $markImg.Dispose()

Write-Output 'header.bmp (150 x 57), sidebar.bmp (164 x 314)'
