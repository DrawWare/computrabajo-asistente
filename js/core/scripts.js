// V3.5: scripts de instalación y uso que van dentro del zip del perfil. Módulo puro (sin DOM).
// Supuesto: el zip se descomprime DENTRO de la carpeta del bot (queda CompuTrabajo/perfil_<slug>/). Los scripts
// buscan computrabajo_bot/main.py en la carpeta, en la de arriba y dos arriba; si no, piden la ruta.
// .bat: CRLF y sin tildes (cmd no siempre usa UTF-8). .sh: LF, bash. Sin URLs (test de privacidad de docs/).

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

export const SCRIPT_NAMES = ["instalar_y_configurar.bat", "iniciar_bot.bat", "instalar_y_configurar.sh", "iniciar_bot.sh"];

const crlf = (text) => text.replace(/\r?\n/g, "\r\n");

const BAT_FIND_BOT = String.raw`:buscar_bot
set "BOT="
for %%D in ("%~dp0computrabajo_bot" "%~dp0..\computrabajo_bot" "%~dp0..\..\computrabajo_bot") do (
  if not defined BOT if exist "%%~D\main.py" set "BOT=%%~fD"
)
if defined BOT goto :eof
echo No encontre la carpeta computrabajo_bot cerca de este archivo.
echo Lo mas simple: descomprimi el zip dentro de la carpeta del bot.
set /p "BOT=O pega la ruta completa de la carpeta computrabajo_bot y apreta Enter: "
if defined BOT if not exist "%BOT%\main.py" (
  echo No existe main.py en esa carpeta.
  set "BOT="
)
goto :eof

:fin_error
echo.
echo Hubo un error. Revisa los mensajes de arriba.
pause
exit /b 1
`;

function installBat(slug) {
  return crlf(String.raw`@echo off
setlocal EnableExtensions
title Instalar y configurar el bot de Computrabajo - perfil ${slug}
set "PERFIL=%~dp0."
call :buscar_bot
if not defined BOT goto :fin_error

echo.
echo [1/5] Buscando Python...
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto :sin_python
%PY% --version
if errorlevel 1 goto :sin_python

echo.
echo [2/5] Entorno virtual en "%BOT%\.venv"...
if not exist "%BOT%\.venv\Scripts\python.exe" %PY% -m venv "%BOT%\.venv"
if errorlevel 1 goto :fin_error
set "VPY=%BOT%\.venv\Scripts\python.exe"

echo.
echo [3/5] Instalando dependencias...
"%VPY%" -m pip install --upgrade pip
"%VPY%" -m pip install -r "%BOT%\requirements.txt"
if errorlevel 1 goto :fin_error

echo.
echo [4/5] Instalando Chromium para Playwright...
"%VPY%" -m playwright install chromium
if errorlevel 1 goto :fin_error

echo.
echo [5/5] Importando el perfil ${slug}...
pushd "%BOT%"
"%VPY%" main.py --import-bundle "%PERFIL%" --profile ${slug} --force
set "RC=%errorlevel%"
popd
if not "%RC%"=="0" goto :fin_error

echo.
echo Listo. Que queres hacer ahora?
echo   [1] Iniciar sesion en Computrabajo - recomendado la primera vez
echo   [2] Prueba sin postular - dry-run, 3 avisos
echo   [3] Salir
set "OPC="
set /p "OPC=Elegi 1, 2 o 3: "
pushd "%BOT%"
if "%OPC%"=="1" "%VPY%" main.py --profile ${slug} --login
if "%OPC%"=="2" "%VPY%" main.py --profile ${slug} --dry-run --limit 3
popd
echo.
echo Para usar el bot mas adelante, ejecuta iniciar_bot.bat
pause
exit /b 0

:sin_python
echo.
echo No encontre Python 3.11 o superior.
echo Instalalo desde python.org y marca la opcion "Add python.exe to PATH". Despues volve a ejecutar este archivo.
pause
exit /b 1

${BAT_FIND_BOT}`);
}

function startBat(slug) {
  return crlf(String.raw`@echo off
setlocal EnableExtensions
title Bot de Computrabajo - perfil ${slug}
call :buscar_bot
if not defined BOT goto :fin_error
set "VPY=%BOT%\.venv\Scripts\python.exe"
if not exist "%VPY%" goto :sin_venv
pushd "%BOT%"

:menu
echo.
echo ===== Bot de Computrabajo - perfil ${slug} =====
echo   [1] Iniciar sesion en Computrabajo --login
echo   [2] Prueba sin postular --dry-run, 3 avisos
echo   [3] Ejecutar postulaciones reales
echo   [4] Salir
set "OPC="
set /p "OPC=Elegi una opcion: "
if not defined OPC goto :salir
if "%OPC%"=="1" goto :login
if "%OPC%"=="2" goto :prueba
if "%OPC%"=="3" goto :real
if "%OPC%"=="4" goto :salir
echo Opcion no valida.
goto :menu

:login
"%VPY%" main.py --profile ${slug} --login
goto :menu

:prueba
"%VPY%" main.py --profile ${slug} --dry-run --limit 3
goto :menu

:real
echo Esto postula de verdad y respeta el tope diario de config.yaml.
set "OK="
set /p "OK=Escribi SI para confirmar: "
if /i "%OK%"=="SI" "%VPY%" main.py --profile ${slug}
goto :menu

:salir
popd
exit /b 0

:sin_venv
echo No encontre el entorno .venv del bot. Ejecuta primero instalar_y_configurar.bat
pause
exit /b 1

${BAT_FIND_BOT}`);
}

const SH_FIND_BOT = String.raw`HERE="$(cd "$(dirname "$0")" && pwd)"
BOT=""
for d in "$HERE/computrabajo_bot" "$HERE/../computrabajo_bot" "$HERE/../../computrabajo_bot"; do
  if [ -z "$BOT" ] && [ -f "$d/main.py" ]; then BOT="$(cd "$d" && pwd)"; fi
done
if [ -z "$BOT" ]; then
  echo "No encontré la carpeta computrabajo_bot cerca de este archivo."
  echo "Lo más simple: descomprimí el zip dentro de la carpeta del bot."
  read -r -p "O pegá la ruta completa de computrabajo_bot y apretá Enter: " BOT
fi
if [ ! -f "$BOT/main.py" ]; then echo "No existe $BOT/main.py"; exit 1; fi`;

function installSh(slug) {
  return String.raw`#!/usr/bin/env bash
# Instala y configura el bot de Computrabajo con el perfil ${slug}.
# Primera vez:  chmod +x *.sh && ./instalar_y_configurar.sh
set -eo pipefail
${SH_FIND_BOT}

PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then echo "No encontré Python 3.11 o superior. Instalalo desde python.org o con tu gestor de paquetes."; exit 1; fi

echo "[1/4] Entorno virtual en $BOT/.venv"
[ -x "$BOT/.venv/bin/python" ] || "$PY" -m venv "$BOT/.venv"
VPY="$BOT/.venv/bin/python"
echo "[2/4] Instalando dependencias"
"$VPY" -m pip install --upgrade pip
"$VPY" -m pip install -r "$BOT/requirements.txt"
echo "[3/4] Instalando Chromium para Playwright"
"$VPY" -m playwright install chromium
echo "[4/4] Importando el perfil ${slug}"
cd "$BOT"
"$VPY" main.py --import-bundle "$HERE" --profile ${slug} --force

echo
echo "¿Qué querés hacer ahora?"
echo "  [1] Iniciar sesión en Computrabajo (recomendado la primera vez)"
echo "  [2] Prueba sin postular (dry-run, 3 avisos)"
echo "  [3] Salir"
read -r -p "Elegí 1, 2 o 3: " OPC
case "$OPC" in
  1) "$VPY" main.py --profile ${slug} --login ;;
  2) "$VPY" main.py --profile ${slug} --dry-run --limit 3 ;;
esac
echo "Para usar el bot más adelante: ./iniciar_bot.sh"
`;
}

function startSh(slug) {
  return String.raw`#!/usr/bin/env bash
# Menú del bot de Computrabajo, perfil ${slug}. Primera vez: chmod +x *.sh
set -eo pipefail
${SH_FIND_BOT}
VPY="$BOT/.venv/bin/python"
if [ ! -x "$VPY" ]; then echo "No encontré el entorno .venv del bot. Ejecutá primero ./instalar_y_configurar.sh"; exit 1; fi
cd "$BOT"
while true; do
  echo
  echo "===== Bot de Computrabajo - perfil ${slug} ====="
  echo "  [1] Iniciar sesión en Computrabajo (--login)"
  echo "  [2] Prueba sin postular (--dry-run, 3 avisos)"
  echo "  [3] Ejecutar postulaciones reales"
  echo "  [4] Salir"
  read -r -p "Elegí una opción: " OPC || exit 0  # stdin cerrado: salir en vez de repetir el menú
  case "$OPC" in
    1) "$VPY" main.py --profile ${slug} --login || true ;;
    2) "$VPY" main.py --profile ${slug} --dry-run --limit 3 || true ;;
    3) read -r -p "Esto postula de verdad. Escribí SI para confirmar: " OK
       if [ "$OK" = "SI" ] || [ "$OK" = "si" ]; then "$VPY" main.py --profile ${slug} || true; fi ;;
    4) exit 0 ;;
    *) echo "Opción no válida." ;;
  esac
done
`;
}

/** Pasos de instalación por sistema (paso 6 y pestaña Guía). */
export const INSTALL_GUIDE = [
  {
    id: "windows",
    title: "Windows",
    steps: [
      "Descomprimí el zip en cualquier carpeta (por ejemplo Escritorio o Documentos). Queda una carpeta computrabajo-<tu-perfil> con todo lo necesario.",
      "Entrá a esa carpeta y hacé doble clic en instalar_y_configurar.bat. Instala Python deps y Chromium (la primera vez tarda unos minutos).",
      "Al terminar elegí [1] para iniciar sesión en Computrabajo en la ventana que se abre, y volvé a la consola para confirmar.",
      "Para usar el bot después: doble clic en iniciar_bot.bat ([2] prueba sin postular, [3] postulaciones reales).",
    ],
  },
  {
    id: "macos",
    title: "macOS",
    steps: [
      "Descomprimí el zip en cualquier carpeta.",
      "Abrí Terminal en la carpeta computrabajo-<tu-perfil> y ejecutá: chmod +x *.sh && ./instalar_y_configurar.sh",
      "Elegí [1] para iniciar sesión en Computrabajo.",
      "Para usar el bot después: ./iniciar_bot.sh",
    ],
  },
  {
    id: "linux",
    title: "Linux",
    steps: [
      "Descomprimí el zip en cualquier carpeta (necesitás python3 y python3-venv).",
      "En una terminal, dentro de computrabajo-<tu-perfil>: chmod +x *.sh && ./instalar_y_configurar.sh",
      "Elegí [1] para iniciar sesión en Computrabajo.",
      "Para usar el bot después: ./iniciar_bot.sh",
    ],
  },
];

/** Los 4 scripts para el perfil `slug`, como [{name, data}] (strings). */
export function buildScripts(slug) {
  if (!SLUG_RE.test(slug)) throw new Error(`slug inválido para los scripts: ${slug}`);
  return [
    { name: "instalar_y_configurar.bat", data: installBat(slug) },
    { name: "iniciar_bot.bat", data: startBat(slug) },
    { name: "instalar_y_configurar.sh", data: installSh(slug) },
    { name: "iniciar_bot.sh", data: startSh(slug) },
  ];
}

// ---- V4.2: scripts del paquete completo (computrabajo-<slug>.zip). Los scripts no buscan carpetas: computrabajo_bot/
// está al lado de ellos y el perfil ya viene dentro (profiles/<slug>/). Mismas reglas que V3: .bat con CRLF y solo
// ASCII; .sh con LF y bash; sin URLs (test de privacidad). Los .sh salen con modo 0755 (ver makeZip).

function packageInstallBat(slug) {
  return crlf(String.raw`@echo off
setlocal EnableExtensions
title Instalar y configurar el bot de Computrabajo - perfil ${slug}
set "BOT=%~dp0computrabajo_bot"
if not exist "%BOT%\main.py" goto :zip_incompleto
if not exist "%BOT%\profiles\@@SLUG@@\config.yaml" goto :zip_incompleto

echo.
echo [1/5] Buscando Python 3.11 o superior...
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto :sin_python
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if errorlevel 1 goto :sin_python
%PY% --version

echo.
echo [2/5] Entorno virtual en "%BOT%\.venv"...
if not exist "%BOT%\.venv\Scripts\python.exe" %PY% -m venv "%BOT%\.venv"
if errorlevel 1 goto :fin_error
set "VPY=%BOT%\.venv\Scripts\python.exe"

echo.
echo [3/5] Instalando dependencias...
"%VPY%" -m pip install --upgrade pip
"%VPY%" -m pip install -r "%BOT%\requirements.txt"
if errorlevel 1 goto :fin_error

echo.
echo [4/5] Instalando Chromium para Playwright...
"%VPY%" -m playwright install chromium
if errorlevel 1 goto :fin_error

echo.
echo [5/5] Perfil ${slug} listo en computrabajo_bot\profiles\@@SLUG@@

echo.
echo Listo. Que queres hacer ahora?
echo   [1] Iniciar sesion en Computrabajo - recomendado la primera vez
echo   [2] Prueba sin postular - dry-run, 3 avisos
echo   [3] Salir
set "OPC="
set /p "OPC=Elegi 1, 2 o 3: "
pushd "%BOT%"
if "%OPC%"=="1" "%VPY%" main.py --profile ${slug} --login
if "%OPC%"=="2" "%VPY%" main.py --profile ${slug} --dry-run --limit 3
popd
echo.
echo Para usar el bot mas adelante, ejecuta iniciar_bot.bat
pause
exit /b 0

:sin_python
echo.
echo No encontre Python 3.11 o superior.
echo Instalalo desde python.org y marca la opcion "Add python.exe to PATH". Despues volve a ejecutar este archivo.
pause
exit /b 1

:zip_incompleto
echo.
echo Falta computrabajo_bot\main.py o computrabajo_bot\profiles\@@SLUG@@\config.yaml.
echo El zip esta incompleto: descargalo de nuevo y descomprimilo entero.
pause
exit /b 1

:fin_error
echo.
echo Hubo un error. Revisa los mensajes de arriba.
pause
exit /b 1
`.replaceAll("@@SLUG@@", slug));
}

function packageStartBat(slug) {
  return crlf(String.raw`@echo off
setlocal EnableExtensions
title Bot de Computrabajo - perfil ${slug}
set "BOT=%~dp0computrabajo_bot"
set "VPY=%BOT%\.venv\Scripts\python.exe"
if not exist "%VPY%" goto :sin_venv
if not exist "%BOT%\profiles\@@SLUG@@\config.yaml" goto :zip_incompleto
pushd "%BOT%"

:menu
echo.
echo ===== Bot de Computrabajo - perfil ${slug} =====
echo   [1] Iniciar sesion en Computrabajo --login
echo   [2] Prueba sin postular --dry-run, 3 avisos
echo   [3] Ejecutar postulaciones reales
echo   [4] Salir
set "OPC="
set /p "OPC=Elegi una opcion (Enter para salir): "
if not defined OPC goto :salir
if "%OPC%"=="1" goto :login
if "%OPC%"=="2" goto :prueba
if "%OPC%"=="3" goto :real
if "%OPC%"=="4" goto :salir
echo Opcion no valida.
goto :menu

:login
"%VPY%" main.py --profile ${slug} --login
goto :menu

:prueba
"%VPY%" main.py --profile ${slug} --dry-run --limit 3
goto :menu

:real
echo Esto postula de verdad y respeta el tope diario de config.yaml.
set "OK="
set /p "OK=Escribi SI para confirmar: "
if /i "%OK%"=="SI" "%VPY%" main.py --profile ${slug}
goto :menu

:salir
popd
exit /b 0

:sin_venv
echo No encontre el entorno .venv del bot. Ejecuta primero instalar_y_configurar.bat
pause
exit /b 1

:zip_incompleto
echo Falta el perfil ${slug} en computrabajo_bot\profiles. El zip esta incompleto: descargalo de nuevo.
pause
exit /b 1
`.replaceAll("@@SLUG@@", slug));
}

function packageInstallSh(slug) {
  return String.raw`#!/usr/bin/env bash
# Instala y configura el bot de Computrabajo con el perfil ${slug} (paquete completo).
# Primera vez: chmod +x *.sh && ./instalar_y_configurar.sh
set -eo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BOT="$HERE/computrabajo_bot"
if [ ! -f "$BOT/main.py" ] || [ ! -f "$BOT/profiles/${slug}/config.yaml" ]; then
  echo "Falta computrabajo_bot/main.py o computrabajo_bot/profiles/${slug}/config.yaml."
  echo "El zip está incompleto: descargalo de nuevo y descomprimilo entero."
  exit 1
fi

PY=""
for candidato in python3 python; do
  if command -v "$candidato" >/dev/null 2>&1 && "$candidato" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
    PY="$candidato"
    break
  fi
done
if [ -z "$PY" ]; then
  echo "No encontré Python 3.11 o superior. Instalalo desde python.org o con tu gestor de paquetes."
  exit 1
fi

echo "[1/4] Entorno virtual en $BOT/.venv"
[ -x "$BOT/.venv/bin/python" ] || "$PY" -m venv "$BOT/.venv"
VPY="$BOT/.venv/bin/python"
echo "[2/4] Instalando dependencias"
"$VPY" -m pip install --upgrade pip
"$VPY" -m pip install -r "$BOT/requirements.txt"
echo "[3/4] Instalando Chromium para Playwright"
"$VPY" -m playwright install chromium
echo "[4/4] Perfil ${slug} listo"

echo
echo "¿Qué querés hacer ahora?"
echo "  [1] Iniciar sesión en Computrabajo (recomendado la primera vez)"
echo "  [2] Prueba sin postular (dry-run, 3 avisos)"
echo "  [3] Salir"
read -r -p "Elegí 1, 2 o 3: " OPC || OPC=3
cd "$BOT"
case "$OPC" in
  1) "$VPY" main.py --profile ${slug} --login ;;
  2) "$VPY" main.py --profile ${slug} --dry-run --limit 3 ;;
esac
echo "Para usar el bot más adelante: ./iniciar_bot.sh"
`;
}

function packageStartSh(slug) {
  return String.raw`#!/usr/bin/env bash
# Menú del bot de Computrabajo, perfil ${slug} (paquete completo). Primera vez: chmod +x *.sh
set -eo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BOT="$HERE/computrabajo_bot"
VPY="$BOT/.venv/bin/python"
if [ ! -x "$VPY" ]; then echo "No encontré el entorno .venv del bot. Ejecutá primero ./instalar_y_configurar.sh"; exit 1; fi
if [ ! -f "$BOT/profiles/${slug}/config.yaml" ]; then echo "Falta el perfil ${slug}: el zip está incompleto."; exit 1; fi
cd "$BOT"
while true; do
  echo
  echo "===== Bot de Computrabajo - perfil ${slug} ====="
  echo "  [1] Iniciar sesión en Computrabajo (--login)"
  echo "  [2] Prueba sin postular (--dry-run, 3 avisos)"
  echo "  [3] Ejecutar postulaciones reales"
  echo "  [4] Salir"
  read -r -p "Elegí una opción (Enter para salir): " OPC || exit 0
  case "$OPC" in
    1) "$VPY" main.py --profile ${slug} --login || true ;;
    2) "$VPY" main.py --profile ${slug} --dry-run --limit 3 || true ;;
    3) read -r -p "Esto postula de verdad. Escribí SI para confirmar: " OK
       if [ "$OK" = "SI" ] || [ "$OK" = "si" ]; then "$VPY" main.py --profile ${slug} || true; fi ;;
    4 | "") exit 0 ;;
    *) echo "Opción no válida." ;;
  esac
done
`;
}

/**
 * V4.2.3: los 4 scripts del paquete completo para `slug`, como [{name, data, mode?}]. Los .sh llevan mode 0o755.
 */
export function buildPackageScripts(slug) {
  if (!SLUG_RE.test(slug)) throw new Error(`slug inválido para los scripts: ${slug}`);
  return [
    { name: "instalar_y_configurar.bat", data: packageInstallBat(slug) },
    { name: "iniciar_bot.bat", data: packageStartBat(slug) },
    { name: "instalar_y_configurar.sh", data: packageInstallSh(slug), mode: 0o755 },
    { name: "iniciar_bot.sh", data: packageStartSh(slug), mode: 0o755 },
  ];
}
