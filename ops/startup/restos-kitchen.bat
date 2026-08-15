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
REM  ⚠ NOTHING IN THIS FILE WAITS FOR A KEYPRESS (August 2026). Every refusal below used to end in
REM    `pause` + `exit /b 2`, and this screen is the one surface in a 27-F11g kitchen that NOBODY
REM    IS STANDING IN FRONT OF -- so a keypress meant a dark screen and an unread message. 01-F67
REM    forbids exactly that inside the app; the reasoning does not stop at the process boundary.
REM    A refusal here PRINTS and HOLDS: it re-reads the env file and retries every 10 minutes.
REM
REM  EDIT THE TWO PATHS BELOW (FAILS is the restart loop's counter -- leave it at 0):
REM ============================================================================================
:start
set "RESTOS_REPO=C:\restos"
set "RESTOS_ENV_FILE=C:\restos\ops\env\kitchen.env"
set "FAILS=0"

if not exist "%RESTOS_ENV_FILE%" (
  echo.
  echo RestOS: %RESTOS_ENV_FILE% not found. The pass screen cannot start without it.
  echo Copy ops\env\kitchen.env.example to that path and fill it in from ops\ids.env.
  echo.
  goto refused
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
  goto refused
)
if not defined RESTOS_BRANCH_ID (
  echo.
  echo RestOS: RESTOS_BRANCH_ID is not set. The pass screen refuses to start without it
  echo (01-F65). Copy it from ops\ids.env -- the SAME branch as the till, or this screen shows
  echo an empty queue while the kitchen waits.
  echo.
  goto refused
)
if not defined RESTOS_DEVICE_ID (
  echo.
  echo RestOS: RESTOS_DEVICE_ID is not set. The pass screen refuses to start without it
  echo (01-F65): it may not guess which device it is, because falling back would adopt the
  echo COUNTER's dev seed id and put two hosts on one store and one lamport sequence
  echo (01-F3, 01-F8), permanently (01-F1). Copy THIS machine's id from ops\ids.env.
  echo.
  goto refused
)
REM  ⚠ ONE KEY PER MEMBER since August 2026 (packages/device-config DEV_STAFF_PIN_ENV). This one
REM    seeds AYESHA alone; RESTOS_DEV_PIN_BILAL and RESTOS_DEV_PIN_HINA seed the other two. The
REM    pass needs no particular ROLE -- signing in here grants no authority, it supplies
REM    attribution (03-F53) -- so one member is enough to work and this gate asks for no more.
REM    Set the other two anyway if the same people work both machines, with the SAME digits they
REM    use on the till, or a cook signs in under a name that is not hers.
REM
REM  ⚠ THIS GATE TESTED RESTOS_DEV_PIN ALONE AND SAID "nobody can sign in here" -- FALSE SINCE
REM    AUGUST 2026, and contradicted by the paragraph directly above it. That key is Ayesha's
REM    alone now (01-F28, one credential per user), so a kitchen with RESTOS_DEV_PIN_HINA or
REM    RESTOS_DEV_PIN_BILAL set has a grid, a sign-in and a working DONE -- and this gate held a
REM    working pass screen dark behind a keypress in an empty kitchen. It asks the true question
REM    now: is the grid EMPTY, i.e. is every one of the three unset. Chained `if not defined` and
REM    not `&&`: cmd has no boolean AND, and this is the shape that does not need delayed
REM    expansion.
if not defined RESTOS_DEV_PIN if not defined RESTOS_DEV_PIN_BILAL if not defined RESTOS_DEV_PIN_HINA (
  echo.
  echo RestOS: none of RESTOS_DEV_PIN, RESTOS_DEV_PIN_BILAL or RESTOS_DEV_PIN_HINA is set, so the
  echo identification grid here is EMPTY and nobody can sign in. The queue still DRAWS -- it is
  echo never gated -- but no ticket can ever be marked ready or handed over, because every one of
  echo those edges carries the signed-in user (02-F41, 03-F53). Set at least one in
  echo %RESTOS_ENV_FILE%, with the SAME digits that person uses on the till.
  echo.
  goto refused
)

cd /d "%RESTOS_REPO%"
if errorlevel 1 (
  echo.
  echo RestOS: %RESTOS_REPO% not found. Set RESTOS_REPO at the top of this file to the checkout.
  echo.
  goto refused
)

REM --- the restart loop ------------------------------------------------------------------
REM  ⚠ THIS LOOP RESTARTED UNCONDITIONALLY EVERY 10 s AND THAT SWALLOWED THE PRODUCT'S BEST
REM    REFUSALS. Since 01-F67 this app RETURNS non-zero instead of blocking on a modal box when it
REM    will not start -- a store bound to another identity (01-F64), a blank or padded id (01-F65),
REM    a second process on one store (01-F66). Each is permanent, and a 10 s loop turned each into
REM    a screen redrawing six times a minute with the sentence naming the fix scrolling past.
REM
REM  ⚠ THE EXIT CODE CANNOT TELL YOU WHICH IT WAS -- checked, not assumed. Every start-time
REM    refusal in both apps is `app.exit(1)`, and 01-F67 closes with "this does not decide the
REM    wording, the channel, or the code beyond 'non-zero'". So the loop counts CONSECUTIVE
REM    failures instead: three quick retries recover a transient, and after that the reason is
REM    left on screen and the retry drops to ten minutes. It never stops and never asks for a key.
:loop
echo [%date% %time%] RestOS pass screen: starting
call pnpm -C apps\pass-kds start
set "CODE=%errorlevel%"
if "%CODE%"=="0" (
  set "FAILS=0"
  echo [%date% %time%] RestOS pass screen: closed normally - restarting in 10s
  timeout /t 10 /nobreak >nul
  goto loop
)
set /a FAILS+=1
echo [%date% %time%] RestOS pass screen: exited with code %CODE% - failure %FAILS% in a row
if %FAILS% LSS 3 (
  timeout /t 10 /nobreak >nul
  goto loop
)
echo.
echo ==========================================================================================
echo  RestOS pass screen: %FAILS% starts in a row have failed. THE REASON IS IN THE LINES ABOVE.
echo.
echo  The gates in this file already passed, so all four variables are PRESENT. What is left is
echo  a value that is present and wrong:
echo    * the three ids do not match the store this machine already has. 01-F64 binds a store to
echo      the identity it was created for and will not open it under another. Correct the env
echo      file to the ids this screen was provisioned with -- and if the ids really did change,
echo      that is a NEW device: mint a fresh device_id. Never delete the old store.
echo    * a value that is blank or carries a trailing space. 01-F65 refuses a padded value, and
echo      the "if not defined" gates above cannot see a space.
echo    * another copy of the pass screen is already running on this machine -- 01-F66, close it.
echo    * `pnpm rebuild:native` has never been run in this checkout, or `pnpm install` is stale.
echo.
echo  ⚠ WHILE THIS SCREEN IS DOWN AND THE TILL IS ROUTED *=screen, THE KITCHEN IS GETTING NOTHING
echo  AND NOTHING ANYWHERE RAISES AN ALARM. Work the pad until it is back.
echo.
echo  Retrying every 10 minutes. Nothing here needs a keypress: fix %RESTOS_ENV_FILE%
echo  and the screen comes up on its own.
echo ==========================================================================================
echo.
timeout /t 600 /nobreak >nul
goto loop

REM --- a configuration refusal: print, hold, re-read, retry ------------------------------
REM  NOT `pause` and NOT `exit /b`. `pause` waits for a human in a kitchen where nobody is looking
REM  at this screen; `exit /b` closes the console holding the only copy of the message.
:refused
echo RestOS: the pass screen cannot start until the message above is fixed.
echo Re-reading %RESTOS_ENV_FILE% and trying again in 10 minutes. No keypress is needed.
timeout /t 600 /nobreak >nul
goto start
