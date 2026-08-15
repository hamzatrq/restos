@echo off
REM ============================================================================================
REM  RestOS COUNTER TILL — unattended start and restart.
REM
REM  INSTALL: press Win+R, type  shell:startup  , and put a SHORTCUT to this file in the folder
REM  that opens. It then runs at every logon, which is what you get after a power cut on a
REM  machine set to auto-logon.
REM
REM  ⚠ THE MACHINE MUST AUTO-LOGON. A till sitting at the Windows lock screen is a till that is
REM    off, and nobody in a restaurant at 19:00 knows the Windows password.
REM  ⚠ SET BIOS "RESTORE ON AC POWER LOSS" TO ON. Otherwise load shedding ends and the till does
REM    not come back until someone presses the button.
REM  ⚠ RUN `pnpm rebuild:native` ONCE PER CHECKOUT BY HAND before first use. It is NOT in this
REM    loop on purpose: it rewrites a native module the test suites also use, and running it on
REM    every boot is both slow and destructive.
REM
REM  ⚠ NOTHING IN THIS FILE WAITS FOR A KEYPRESS, AND THAT IS DELIBERATE (August 2026).
REM    Every refusal below used to end in `pause` + `exit /b 2`. On the auto-logon machine this
REM    file exists for there is nobody in front of the screen at 05:00, so `pause` was a till that
REM    never started and a message nobody read. 01-F67 names exactly that shape one layer down —
REM    a refusal may not be delivered "by waiting for a human" — and the reasoning does not stop
REM    at the process boundary. A refusal here now PRINTS and HOLDS: it re-reads the env file and
REM    tries again every 10 minutes, so the sentence stays on screen AND an operator who fixes
REM    counter.env over remote desktop gets a till without touching this machine.
REM
REM  EDIT THE TWO PATHS BELOW (FAILS is the restart loop's counter -- leave it at 0):
REM ============================================================================================
:start
set "RESTOS_REPO=C:\restos"
set "RESTOS_ENV_FILE=C:\restos\ops\env\counter.env"
set "FAILS=0"

REM --- load the env file -----------------------------------------------------------------
REM  eol=# skips comment lines; blank lines are skipped by for /f itself. delims== with
REM  tokens=1,* splits on the FIRST '=' only, so RESTOS_STATION_ROUTES=*=screen survives with
REM  its value intact — that line is the one this whole file exists to deliver correctly.
if not exist "%RESTOS_ENV_FILE%" (
  echo.
  echo RestOS: %RESTOS_ENV_FILE% not found. The till cannot start without it.
  echo Copy ops\env\counter.env.example to that path and fill it in from ops\ids.env.
  echo.
  goto refused
)
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%RESTOS_ENV_FILE%") do (
  if not "%%~A"=="" set "%%~A=%%~B"
)

REM  WHICH DEVICE THIS IS (01-F13 / 01-F65). apps/pos-electron resolves these PER KEY and falls
REM  back to a marked DEV SEED -- 01-F65's one stated exemption, granted to the counter app's
REM  documented no-environment `pnpm start`. This file is the PRODUCTION launcher, not that launch.
REM  A till left on the seed carries a device_id no gateway has ever heard of: it starts, every
REM  boot line reports success, and it never sees a menu and never syncs a sale. There is no error
REM  message for that anywhere in the product, which is the whole reason to refuse it here.
if not defined RESTOS_ORG_ID (
  echo.
  echo RestOS: RESTOS_ORG_ID is not set in %RESTOS_ENV_FILE%.
  echo The till would fall back to a DEV SEED id and would silently belong to no organisation:
  echo it starts, reports success everywhere, and never sees a menu. Copy all three ids from
  echo ops\ids.env -- the SAME values you passed to provision-device for THIS machine.
  echo.
  goto refused
)
if not defined RESTOS_BRANCH_ID (
  echo.
  echo RestOS: RESTOS_BRANCH_ID is not set in %RESTOS_ENV_FILE%.
  echo The till would fall back to a DEV SEED branch. Prices are per (branch, channel) with no
  echo fallback, so every tile would read "no price set" and nothing would be sellable.
  echo Copy it from ops\ids.env.
  echo.
  goto refused
)
if not defined RESTOS_DEVICE_ID (
  echo.
  echo RestOS: RESTOS_DEVICE_ID is not set in %RESTOS_ENV_FILE%.
  echo The till would fall back to a DEV SEED device id that no gateway has admitted, so it
  echo would never sync -- and if a second machine did the same, two tills would push under one
  echo id and fork one outbox, permanently (01-F1, 01-F8). Copy it from ops\ids.env.
  echo.
  goto refused
)

REM  Fail loudly on the value whose absence is silent. An unset RESTOS_STATION_ROUTES does not
REM  stop the till — it makes EVERY order raise a print alarm nobody can clear, all night.
if not defined RESTOS_STATION_ROUTES (
  echo.
  echo RestOS: RESTOS_STATION_ROUTES is not set in %RESTOS_ENV_FILE%.
  echo With the default every station routes to PAPER, so unless RESTOS_PRINTER names a real
  echo printer every order will raise an alarm band ~20 seconds after "send to kitchen" and the
  echo kitchen will get nothing. Set  RESTOS_STATION_ROUTES=*=screen  and make sure the pass
  echo screen is on. NOTE: that setting routes KITCHEN STATIONS only. Receipts and cash slips
  echo are not station-routed, so on a till with no printer every settlement still raises a
  echo band the cashier clears by hand.
  echo.
  goto refused
)
REM  ⚠ THIS GATE REFUSED ON RESTOS_DEV_PIN AND GAVE A REASON THAT STOPPED BEING TRUE IN AUGUST
REM    2026. It said "the staff grid will be EMPTY and nobody can sign in". That was correct while
REM    one PIN seeded the whole roster; since 01-F28's one-credential-per-user split
REM    (packages/device-config DEV_STAFF_PIN_ENV) RESTOS_DEV_PIN is AYESHA ALONE, and a till with
REM    RESTOS_DEV_PIN_HINA set has a manager who can sign in, open the day, ring and settle
REM    (permissions.ts: branch_manager is `allow` on order.create, payment.settle and
REM    day.open_close). So the old gate refused to start a WORKING till, on an auto-logon machine,
REM    behind a keypress nobody was there to press. It is a WARNING now, exactly like Bilal's.
REM
REM  One key PER MEMBER (01-F26/01-F27/01-F28). There is deliberately NO fallback between members:
REM  a member nobody configured is absent from the grid rather than reachable with a neighbour's
REM  digits. So this gate has to name each key, and the manager's is the only one that stops
REM  SERVICE rather than merely shrinking the grid -- only a branch manager may open the day
REM  (02-F22), so a till with two cashiers and no manager starts, looks correct, and cannot take
REM  the first order of the shift. It is also the gate that catches the all-blank case: with no
REM  manager there is no day, whoever else is on the grid.
if not defined RESTOS_DEV_PIN (
  echo.
  echo RestOS: RESTOS_DEV_PIN is not set. Ayesha will be absent from the staff grid. This is a
  echo WARNING, not a refusal -- since August 2026 this key is HER PIN alone, not the roster's,
  echo so a till with RESTOS_DEV_PIN_HINA set still opens the day and still sells.
  echo Set it in %RESTOS_ENV_FILE% when that person starts.
  echo.
)
if not defined RESTOS_DEV_PIN_HINA (
  echo.
  echo RestOS: RESTOS_DEV_PIN_HINA is not set, so this till has NO BRANCH MANAGER on its staff
  echo grid. Only a manager can open the day (02-F22), so the till would start looking correct
  echo and refuse the first order of the shift -- and if the cashiers' keys are blank too, the
  echo grid is empty and nobody can sign in at all.
  echo Set it in %RESTOS_ENV_FILE%. It must be DIFFERENT from the cashiers' PINs -- a shared
  echo manager PIN is the authorization hole this per-member split exists to close.
  echo.
  goto refused
)
if not defined RESTOS_DEV_PIN_BILAL (
  echo.
  echo RestOS: RESTOS_DEV_PIN_BILAL is not set. The second cashier will be absent from the
  echo staff grid. This is a WARNING, not a refusal -- one cashier and one manager is a
  echo workable shift. Set it in %RESTOS_ENV_FILE% when that person starts.
  echo.
)

cd /d "%RESTOS_REPO%"
if errorlevel 1 (
  echo.
  echo RestOS: %RESTOS_REPO% not found. Set RESTOS_REPO at the top of this file to the checkout.
  echo.
  goto refused
)

REM --- the restart loop ------------------------------------------------------------------
REM  `pnpm start` builds the three bundles and then launches Electron, so a machine that was
REM  updated between shifts comes back on the new code without anyone remembering to build.
REM
REM  ⚠ THIS LOOP RESTARTED UNCONDITIONALLY EVERY 10 s AND THAT SWALLOWED THE PRODUCT'S BEST
REM    REFUSALS. Since 01-F67 (August 2026) the counter RETURNS non-zero instead of hanging when
REM    it will not start -- a store bound to another identity (01-F64), a blank or padded id
REM    (01-F65), a second instance on one store (01-F66), a missing rebuild:native. Every one of
REM    those is permanent, and an unconditional 10 s loop turned each into six console redraws a
REM    minute all night with the sentence naming the fix scrolling past faster than it can be read.
REM
REM  ⚠ AND THE EXIT CODE CANNOT TELL YOU WHICH IT WAS. This was checked rather than assumed: every
REM    start-time refusal in both apps is `app.exit(1)`, and 01-F67 closes with "this does not
REM    decide the wording, the channel, or the code beyond 'non-zero'" -- so a configuration
REM    refusal and a crash are the same number here, deliberately. What IS available is the SHAPE:
REM    a refusal returns immediately and returns again on every attempt, while a till that served
REM    a shift and fell over comes back on the next try. So the loop counts CONSECUTIVE failures.
REM    Three quick retries cost 30 s and recover the transient case; after that the reason is
REM    printed and left on screen and the retry drops to ten minutes. It never stops retrying and
REM    it never waits for a keypress, so a machine fixed remotely comes back on its own.
:loop
echo [%date% %time%] RestOS counter: starting
call pnpm -C apps\pos-electron start
set "CODE=%errorlevel%"
if "%CODE%"=="0" (
  set "FAILS=0"
  echo [%date% %time%] RestOS counter: closed normally - restarting in 10s
  timeout /t 10 /nobreak >nul
  goto loop
)
set /a FAILS+=1
echo [%date% %time%] RestOS counter: exited with code %CODE% - failure %FAILS% in a row
if %FAILS% LSS 3 (
  timeout /t 10 /nobreak >nul
  goto loop
)
echo.
echo ==========================================================================================
echo  RestOS counter: %FAILS% starts in a row have failed. THE REASON IS IN THE LINES ABOVE --
echo  read them before anything else; the app prints one sentence naming what it wants.
echo.
echo  The gates in this file already passed, so all five variables are PRESENT. What is left is
echo  a value that is present and wrong:
echo    * RESTOS_ORG_ID / RESTOS_BRANCH_ID / RESTOS_DEVICE_ID do not match the store this
echo      machine already has (01-F64). The store is bound to the identity it was created for
echo      and will not open under another. Correct the env file to the ids this device was
echo      provisioned with -- and if the ids really did change, that is a NEW device: mint a
echo      fresh device_id (01-N5). Never delete the old store; it may hold unsynced sales.
echo    * a value that is blank or carries a trailing space. 01-F65 refuses a padded value, and
echo      the "if not defined" gates above cannot see a space.
echo    * another copy of the till is already running on this machine (01-F66) -- close it.
echo    * `pnpm rebuild:native` has never been run in this checkout, or `pnpm install` is stale.
echo.
echo  Retrying every 10 minutes. Nothing here needs a keypress: fix %RESTOS_ENV_FILE%
echo  and the till comes up on its own.
echo ==========================================================================================
echo.
timeout /t 600 /nobreak >nul
goto loop

REM --- a configuration refusal: print, hold, re-read, retry ------------------------------
REM  NOT `pause` and NOT `exit /b`. `pause` waits for a human on a machine with none (01-F67's
REM  reasoning, one layer up); `exit /b` closes the console that is holding the only copy of the
REM  message. Holding does both jobs at once, and re-reading the env file means a remote fix
REM  starts the till with nobody walking to it.
:refused
echo RestOS: the till cannot start until the message above is fixed.
echo Re-reading %RESTOS_ENV_FILE% and trying again in 10 minutes. No keypress is needed.
timeout /t 600 /nobreak >nul
goto start
