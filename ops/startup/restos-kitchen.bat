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

REM  ITS OWN identity, and NOT the till's. apps/pass-kds calls requireDeviceIdentity, which
REM  refuses an ABSENT key outright (01-F65) -- it does NOT fall back. So the app would die at
REM  boot naming the key; these gates exist to say it before the restart loop starts spinning.
REM
REM  ⚠ ALL THREE, not just the device id. This gate checked RESTOS_DEVICE_ID alone, so a screen
REM    with its org or branch missing passed the gate and then crashed on the first launch of the
REM    loop -- a refusal the operator sees only by reading the console it scrolled past.
if not defined RESTOS_ORG_ID (
  echo.
  echo RestOS: RESTOS_ORG_ID is not set. The pass screen refuses to start without it (01-F65)
  echo and will not guess. Copy it from ops\ids.env -- the SAME org as the till.
  echo.
  pause
  exit /b 2
)
if not defined RESTOS_BRANCH_ID (
  echo.
  echo RestOS: RESTOS_BRANCH_ID is not set. The pass screen refuses to start without it
  echo (01-F65). Copy it from ops\ids.env -- the SAME branch as the till, or this screen shows
  echo an empty queue while the kitchen waits.
  echo.
  pause
  exit /b 2
)
if not defined RESTOS_DEVICE_ID (
  echo.
  echo RestOS: RESTOS_DEVICE_ID is not set. The pass screen refuses to start without it
  echo (01-F65): it may not guess which device it is, because falling back would adopt the
  echo COUNTER's dev seed id and put two hosts on one store and one lamport sequence
  echo (01-F3, 01-F8), permanently (01-F1). Copy THIS machine's id from ops\ids.env.
  echo.
  pause
  exit /b 2
)
REM  ⚠ ONE KEY PER MEMBER since August 2026 (packages/device-config DEV_STAFF_PIN_ENV). This one
REM    seeds AYESHA alone; RESTOS_DEV_PIN_BILAL and RESTOS_DEV_PIN_HINA seed the other two. The
REM    pass needs no particular ROLE -- signing in here grants no authority, it supplies
REM    attribution (03-F53) -- so one member is enough to work and this gate asks for no more.
REM    Set the other two anyway if the same people work both machines, with the SAME digits they
REM    use on the till, or a cook signs in under a name that is not hers.
if not defined RESTOS_DEV_PIN (
  echo.
  echo RestOS: RESTOS_DEV_PIN is not set, so nobody can sign in here. The queue still DRAWS --
  echo it is never gated -- but no ticket can ever be marked ready or handed over, because
  echo every one of those edges carries the signed-in user (02-F41). Set it in %RESTOS_ENV_FILE%.
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
