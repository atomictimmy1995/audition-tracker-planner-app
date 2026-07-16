# Running Advance on your iPhone (from a Windows PC)

You run a small dev server on your Windows computer; your iPhone connects to it
over WiFi through the free **Expo Go** app. Both devices must be on the **same
WiFi network**.

Do Part A once. After that, running the app again is just Part C.

---

## Part A — one-time setup on the Windows PC

1. **Install Node.js** (this includes `npm`).
   - Go to https://nodejs.org and download the **LTS** version.
   - Run the installer, click through with defaults.
   - Verify: open **Command Prompt** (press Start, type `cmd`, Enter) and run:
     ```
     node --version
     ```
     You should see something like `v22.x`.

2. **Install Git** (to download the code and get updates later).
   - Go to https://git-scm.com/download/win, download, install with defaults.

3. **Download the code.** In Command Prompt:
   ```
   cd %USERPROFILE%\Documents
   git clone https://github.com/atomictimmy1995/audition-tracker-planner-app.git
   cd audition-tracker-planner-app
   ```
   Later, to get updates I've pushed, run `git pull` from this folder.

4. **Install the app's dependencies** (from inside that folder):
   ```
   npm install --legacy-peer-deps
   ```
   This takes a few minutes the first time.

---

## Part B — connect it to your database (one time)

The app needs two values to reach Supabase.

1. Get your **anon key**:
   - Open https://supabase.com/dashboard/project/fufhymaxcxubcplzhhom/settings/api
   - Find **Project API keys** → copy the **`anon` / `public`** key
     (a long string; if your project shows a **Publishable key** starting with
     `sb_publishable_`, copy that instead — either works).

2. Create a file named exactly **`.env`** in the project folder with this content:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://fufhymaxcxubcplzhhom.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=PASTE_YOUR_ANON_KEY_HERE
   ```
   Easiest way: in Command Prompt from the project folder:
   ```
   notepad .env
   ```
   Notepad will ask to create it — click Yes, paste the two lines, replace the
   placeholder with your key, then **File → Save**.
   > ⚠️ If Notepad saved it as `.env.txt`, rename it back to `.env`
   > (in File Explorer, turn on **View → File name extensions** to see this).

The anon key is safe to keep on your machine — it's designed to be public;
your database's security rules are the real protection.

---

## Part C — start it and open on your phone

1. On the **iPhone**, install **Expo Go** from the App Store (free).

2. On the **PC**, from the project folder:
   ```
   npx expo start
   ```
   A **QR code** appears in the window. Leave this running.

3. On the **iPhone**, open the **Camera** app and point it at the QR code.
   Tap the banner that appears — it opens the project in Expo Go, which then
   builds and launches Advance (first load takes ~30 seconds).

4. You'll land on the sign-in screen. **Create an account** with your email +
   a password (6+ characters), and you're in.

To stop the server later: click the Command Prompt window and press `Ctrl + C`.
To run again another day: `cd` to the folder and run `npx expo start`.

---

## If the phone won't connect

Usually it's the WiFi (some home routers, and most work/guest networks, block
devices from talking to each other). Fix: use a **tunnel**, which connects your
phone to the PC over the internet instead of the local network.

```
npx expo start --tunnel
```
The first time, it'll ask to install a helper (`@expo/ngrok`) — say yes. Then
scan the new QR code the same way. This is slower but works almost anywhere.

Other quick checks:
- Phone and PC on the **same WiFi**? (Not one on WiFi, one on cellular.)
- Windows Firewall popup when you first ran `expo start`? Click **Allow**.

---

## What to try first (the real end-to-end test)

1. **Add an audition** (name + a date a couple months out).
2. **Paste a rep list** on the audition screen — this is the big test: it calls
   the AI to match your text to the excerpt library. A few taps to confirm any
   uncertain matches.
3. **Rate each excerpt** (one tap each).
4. Do that for a second and third audition, then open **Overlap analysis** —
   the shared-spine screen.
5. Fill in the **six-question practice profile**, then **generate your plan**.
6. On an excerpt card, **record a take** and play it back.

If anything looks off or errors, tell me exactly what you saw — that's the
feedback that makes the app real.
