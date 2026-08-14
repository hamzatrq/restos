@echo off
REM ============================================================================================
REM  RestOS KITCHEN / PASS SCREEN — unattended start and restart.
REM
REM  INSTALL: Win+R -> shell:startup -> put a SHORTCUT to this file in the folder that opens.
REM
REM  ⚠ WITH THE TILL ROUTED `*=screen`, THIS MACHINE IS THE ONLY ROUTE FROM THE COUNTER TO A
REM    COOK. If it is off, tickets are not printed anywhere else and NOTHING RAISES AN ALARM.
REM    A screen nobody is watching fails more quietly than a dead printer. Check it is on at
REM    the start of every shift.
REM  ⚠ Auto-logon and BIOS "restore on AC power loss" apply here exactly as on the till.
REM  ⚠ Run `pnpm rebuild:native` ONCE per checkout by hand before first use.
REM
REM  EDIT THESE TWO LINES:
REM ============================================================================================
set "RESTOS_REPO=C:\restos"
set "RESTOS_ENV_FILE=C:\restos\ops\env\kitchen.env"

if not exist "%RESTOS_ENV_FILE%" (
  echo RestOS: %RESTOS_ENV_FILE% not found. The pass screen cannot start without it.
  echo Copy ops\env\kitchen.env.example to that path and fill it in from ops\ids.env.
  pause
  exit /b 2
)
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%RESTOS_ENV_FILE%") do (
  if not "%%~A"=="" set "%%~A=%%~B"
)

REM  Its own id, and NOT the till's. Two apps under one device id share one store.
if not defined RESTOS_DEVICE_ID (
  echo.
  echo RestOS: RESTOS_DEVICE_ID is not set. This screen would fall back to a hardcoded dev
  echo seed id that no gateway has ever heard of, and would receive nothing.
  echo.
  pause
  exit /b 2
)
if not defined RESTOS_DEV_PIN (
  echo.
  echo RestOS: RESTOS_DEV_PIN is not set, so nobody can sign in here. The queue will fill and
  echo no ticket can ever be marked ready. Set it in %RESTOS_ENV_FILE%.
  echo.
  pause
  exit /b 2
)

cd /d "%RESTOS_REPO%" || (echo RestOS: %RESTOS_REPO% not found & pause & exit /b 2)

:loop
echo [%date% %time%] RestOS pass screen: starting
call pnpm -C apps\pass-kds start
echo [%date% %time%] RestOS pass screen: exited with code %errorlevel% - restarting in 10s
timeout /t 10 /nobreak >nul
goto loop
