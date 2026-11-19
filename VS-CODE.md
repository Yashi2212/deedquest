# Run DeedQuest in VS Code

## First-time setup

1. Install Node.js 22 or 24 from [nodejs.org](https://nodejs.org/), then restart VS Code.
2. In VS Code, select **File → Open Folder** and open the `deedquest` folder inside `New folder`. Open the game folder itself, where `package.json` is located.
3. Select **Terminal → New Terminal**. In PowerShell, run:

   ```powershell
   node --version
   npm.cmd install --global pnpm@10.34.6
   pnpm.cmd install
   pnpm.cmd dev
   ```

4. Open **http://localhost:5173** in your browser. Keep the terminal running. Stop it with **Ctrl+C**.

Using `.cmd` avoids PowerShell script-execution-policy errors without changing your system's security settings. In Command Prompt, macOS, or Linux, use `npm` and `pnpm` without `.cmd`.

## Next time

Open the same folder and run:

```powershell
pnpm.cmd dev
```

If VS Code opens the wrong directory, first run:

```powershell
Set-Location -LiteralPath 'C:\Users\abhis\OneDrive\Documents\ChatGPT\New folder\deedquest'
```

## Play and test

- Create a room and add bot players in the lobby to test alone.
- For a second human on the same computer, use a different browser profile or a private window. Ordinary tabs share your player identity.
- Local play saves rooms in `.local-data`; no Redis account is needed locally.
- The terminal prints a network address for friends on the same Wi-Fi. A `localhost` invite only works on your computer.
- Run `pnpm.cmd check`, `pnpm.cmd test`, and `pnpm.cmd build` to check types, run tests, and build for deployment.
- `pnpm.cmd preview` only previews the static frontend. Use `pnpm.cmd dev` for local multiplayer.

## Publish for friends on the internet

For the ad-supported version, follow [CLOUDFLARE.md](CLOUDFLARE.md) for deployment commands and private Upstash secrets. [VERCEL-PLAYTEST.md](VERCEL-PLAYTEST.md) has the Vercel beta instructions and explains which plans are eligible. Never put database secrets in frontend source or commit .env.local or .dev.vars.

The free hosting setup suits occasional private games within the providers' limits. See [CAPACITY.md](CAPACITY.md) before planning public traffic or thousands of simultaneous users.
