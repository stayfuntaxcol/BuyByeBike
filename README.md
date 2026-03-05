# Fiets Tegoed App (Firebase versie)

Mobiele HTML-app voor **Larah Fae** met snelle ritregistratie (1–2 taps), saldo-overzicht en Firebase sync.

## Wat zit erin
- **Vandaag bovenaan** (dag van invoer)
- **Snelle invoer** met 1 klik (combinaties)
- **Los invullen** heen/terug in 2 clicks
- Tarieven standaard:
  - 🚲 Fiets: **+€1,00**
  - 🚌 Bus: **-€5,00**
  - 🚗 Gebracht/Gehaald: **-€2,50**
  - 🚗 Carpool: **€0,00**
- **Startdatum telling:** 2026-03-02
- **Geen deletes**
- **Oudermodus pincode:** 1976 (pas aan in de app of in `app.js`)
- **Firebase Anonymous Auth** (dus geen Google login nodig)

---

## Bestanden
- `index.html` — de app
- `app.js` — logica + Firebase koppeling
- `styles.css` — styling
- `firebase.rules` — Firestore rules (copy-paste)
- `README.md` — deze uitleg

---

## Snelle setup (Firebase + GitHub Pages)

### 1) Firebase project maken
1. Maak een nieuw project in Firebase Console.
2. Voeg een **Web app** toe.
3. Maak **Cloud Firestore** database aan.
4. Zet **Authentication > Sign-in method > Anonymous** aan.

Firebase ondersteunt webapps via de JavaScript SDK en anonymous auth kun je expliciet inschakelen. citeturn0search0turn0search5

### 2) Firestore Rules instellen
- Open **Firestore Database > Rules**
- Plak de inhoud van `firebase.rules`
- Publish

Let op: updates van Firestore Rules kunnen even duren voordat alles is doorgevoerd. citeturn0search2

### 3) Firebase config invullen in `app.js`
Zoek bovenin `app.js` naar:

```js
const firebaseConfig = {
  apiKey: "VUL_HIER_JE_API_KEY_IN",
  ...
};
```

Plak daar jouw config uit de Firebase Console.

### 4) GitHub Pages publiceren
GitHub Pages host statische HTML/CSS/JS rechtstreeks vanuit je repository. citeturn0search7turn0search3

**Kort:**
1. Maak een nieuwe GitHub repository
2. Upload alle bestanden uit deze map
3. Ga naar **Settings > Pages**
4. Kies branch `main` en map `/root`
5. Save
6. Je krijgt een `https://...github.io/...` link

---

## Gebruik
- Open de app op je mobiel
- Bovenaan staat **vandaag**
- Tik een snelle combo (1 klik) of vul heen + terug los in (2 clicks)
- Alles wordt direct opgeslagen in Firebase

### Delen met je dochter
- Klik op **🔗 Deel link**
- De app zet een `family=` parameter in de URL
- Deel die link met je dochter

---

## Veiligheid (eerlijk verhaal)
Deze versie gebruikt **anonymous auth** en een gedeelde family-link. Dat is praktisch, maar niet superstrak.

Voor echte rolbeveiliging (ouder/dochter apart) is de volgende stap:
- **Google login**
- Firestore rules met **whitelist van jullie e-mailadressen**

---

## Tips voor later (v2)
- Google login + rolverdeling
- Meerdere kinderen in één gezinsoverzicht
- Kalenderweergave per maand
- Notities per rit (regen / pech / etc.)
- PWA (icoon op homescreen)
