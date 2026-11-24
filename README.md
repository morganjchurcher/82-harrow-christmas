# 🎄 82 Harrow Christmas Dinner Dashboard

An interactive, multi-device dashboard for organising the **82 Harrow** uni house Christmas dinner.

## How Accounts & Permissions Work

1. **First Account = Organiser (Admin)**:
   - The very first account registered becomes the **👑 Organiser**.
   - **Only the Organiser** can add, edit, or delete dishes & roles on the menu (and edit the dinner date/time/announcement or reset forgotten passwords).
2. **Housemate Accounts**:
   - Every other housemate creates their own individual account (Name + Username + Password) from their phone or laptop.
   - Housemates can log back into their account anytime from any device and **claim/unclaim dishes & roles**, add preparation notes, and update their dish status (`📝 Claimed` → `🛒 Bought` → `✅ Ready`).

---

## Running Locally & Sharing Across Devices

Start the server (uses built-in Python 3 + SQLite, zero dependencies to install):

```bash
python3 app.py
```

- **On your laptop**: Open `http://localhost:8080`
- **For housemates on 82 Harrow Wi-Fi**: Open the `http://192.168.x.x:8080` link printed in the terminal from any phone or laptop in the house.
- **Instant public internet link from your laptop (works on mobile data too)**:
  Run this built-in macOS SSH tunnel command in another terminal tab:
  ```bash
  ssh -R 80:localhost:8080 nokey@localhost.run
  ```
  It will print an `https://....lhr.life` link you can drop straight into the 82 Harrow group chat.

---

## Deploying 24/7 for Free (Render or Railway)

Because this project includes `Procfile`, `render.yaml`, and `requirements.txt`:
1. Push this folder to a GitHub repository.
2. On [Render](https://render.com) or [Railway](https://railway.app), click **New Web Service** and connect the repository.
3. Render/Railway will automatically run `python3 app.py` and give you a permanent `https://...` URL for the house chat.
