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
REM  EDIT THESE TWO LINES:
REM ============================================================================================
set "RESTOS_REPO=C:\restos"
set "RESTOS_ENV_FILE=C:\restos\ops\env\counter.env"

REM --- load the env file -----------------------------------------------------------------
REM  eol=# skips comment lines; blank lines are skipped by for /f itself. delims== with
REM  tokens=1,* splits on the FIRST '=' only, so RESTOS_STATION_ROUTES=*=screen survives with
REM  its value intact — that line is the one this whole file exists to deliver correctly.
if not exist "%RESTOS_ENV_FILE%" (
  echo RestOS: %RESTOS_ENV_FILE% not found. The till cannot start without it.
  echo Copy ops\env\counter.env.example to that path and fill it in from ops\ids.env.
  pause
  exit /b 2
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
  pause
  exit /b 2
)
if not defined RESTOS_BRANCH_ID (
  echo.
  echo RestOS: RESTOS_BRANCH_ID is not set in %RESTOS_ENV_FILE%.
  echo The till would fall back to a DEV SEED branch. Prices are per (branch, channel) with no
  echo fallback, so every tile would read "no price set" and nothing would be sellable.
  echo Copy it from ops\ids.env.
  echo.
  pause
  exit /b 2
)
if not defined RESTOS_DEVICE_ID (
  echo.
  echo RestOS: RESTOS_DEVICE_ID is not set in %RESTOS_ENV_FILE%.
  echo The till would fall back to a DEV SEED device id that no gateway has admitted, so it
  echo would never sync -- and if a second machine did the same, two tills would push under one
  echo id and fork one outbox, permanently (01-F1, 01-F8). Copy it from ops\ids.env.
  echo.
  pause
  exit /b 2
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
  pause
  exit /b 2
)
if not defined RESTOS_DEV_PIN (
  echo.
  echo RestOS: RESTOS_DEV_PIN is not set, so the staff grid will be EMPTY and nobody can
  echo sign in. The till will start and be unusable. Set it in %RESTOS_ENV_FILE%.
  echo.
  pause
  exit /b 2
)
REM  One key PER MEMBER since August 2026 (01-F26/01-F27, packages/device-config DEV_STAFF_PIN_ENV).
REM  There is deliberately NO fallback between members: a member nobody configured is absent from
REM  the grid rather than reachable with a neighbour's digits. So this gate has to name each key,
REM  and the manager's is the one that stops SERVICE rather than merely shrinking the grid --
REM  only a branch manager may open the day (02-F22), so a till with two cashiers and no manager
REM  starts, looks correct, and cannot take the first order of the shift.
if not defined RESTOS_DEV_PIN_HINA (
  echo.
  echo RestOS: RESTOS_DEV_PIN_HINA is not set, so this till has NO BRANCH MANAGER on its staff
  echo grid. Only a manager can open the day (02-F22), so the till will start, the cashiers
  echo will be able to sign in, and the first order of the shift will be refused.
  echo Set it in %RESTOS_ENV_FILE%. It must be DIFFERENT from the cashiers' PINs -- a shared
  echo manager PIN is the authorization hole this per-member split exists to close.
  echo.
  pause
  exit /b 2
)
if not defined RESTOS_DEV_PIN_BILAL (
  echo.
  echo RestOS: RESTOS_DEV_PIN_BILAL is not set. The second cashier will be absent from the
  echo staff grid. This is a WARNING, not a refusal -- one cashier and one manager is a
  echo workable shift. Set it in %RESTOS_ENV_FILE% when that person starts.
  echo.
)

cd /d "%RESTOS_REPO%" || (echo RestOS: %RESTOS_REPO% not found & pause & exit /b 2)

REM --- the restart loop ------------------------------------------------------------------
REM  `pnpm start` builds the three bundles and then launches Electron, so a machine that was
REM  updated between shifts comes back on the new code without anyone remembering to build.
REM  The 10 s pause is what stops a configuration error becoming a spin: a till that cannot
REM  start retries six times a minute for ever otherwise, and the log scrolls past the reason.
:loop
echo [%date% %time%] RestOS counter: starting
call pnpm -C apps\pos-electron start
echo [%date% %time%] RestOS counter: exited with code %errorlevel% - restarting in 10s
timeout /t 10 /nobreak >nul
goto loop
