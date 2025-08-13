````markdown
# Helix: Offline AI Coding Assistant

A futuristic **offline AI code assistant** with a bold red cyber-robot interface.  
Built with **React**, **Prism.js**, and **pure CSS** for a Jarvis-style experience.

---

## 🚀 Features

- **Jarvis-Style UI** – Neon, glassmorphic, animated—feels like Tony Stark’s lab.
- **Local & Private** – Runs entirely on your device with Ollama or a local API backend.
- **Chat to Code** – Type prompts, receive AI-generated code, view them in collapsible, syntax-highlighted blocks.
- **Multi-Model Support** – Choose from installed models, with usage hints in the dropdown.
- **Customizable** – Change CSS, add new commands, or connect different local LLM/code models.

---

## 🛠️ Getting Started

### 1. Clone this repository
```bash
git clone https://github.com/yourusername/jarvis-coder.git
cd jarvis-coder
````

### 2. Install dependencies

```bash
npm install
```

### 3. Set API base URL

Create a `.env` file in the project root:

```bash
REACT_APP_API_BASE=http://127.0.0.1:4000
```

> ⚠️ Make sure your local backend (Ollama API or equivalent) is running on the same port.

### 4. Start the development server

```bash
npm start
```

This will launch the app at `http://localhost:3000`.

---

## ⚡ Backend Setup (Ollama Example)

If you are using **Ollama** as your local LLM backend:

1. **Install Ollama**
   [https://ollama.ai/download](https://ollama.ai/download)

2. **Run your desired models**

   ```bash
   ollama pull deepseek-coder:33b
   ollama pull mistral:7b-instruct
   ollama pull qwen2.5:14b-instruct
   ```

3. **Start the backend server**
   If using a Node/Express wrapper, run:

   ```bash
   npm run server
   ```

   Make sure it’s listening at `http://127.0.0.1:4000`.

---

## 🎛 Using the App

* Select a model from the **dropdown**. Installed models appear first.
* Type your prompt in the input field.
* View AI responses with **syntax highlighting** and collapsible code blocks.
* Click **Refresh** to re-scan installed models.

---

## 📂 Project Structure

```
src/
  App.js            # Main React component
  Helix.css         # UI styles
  components/       # (Optional) Shared UI components
public/
  index.html
.env                # API base config
```

---

## 🔧 Customization

* **Change theme:** Edit `Helix.css`.
* **Add models:** Update `MODEL_INFO` in `App.js`.
* **Modify backend URL:** Change `REACT_APP_API_BASE` in `.env`.

---

## 🖼️ Screenshot

![Helix Screenshot](screenshot.png)

---

## 📜 License

MIT License – feel free to use and modify.

---

## 💡 Tip

If you get:

```
Couldn't read installed models. Got HTML from server. Check REACT_APP_API_BASE.
```

It means the API URL is wrong or the backend isn’t running.
Verify `.env` and ensure the backend is reachable at that address.

---

```

If you want, I can also make a **shorter, flashy version** for your GitHub with animated GIFs showing Helix in action so it feels more like a showcase. That would make the repo stand out a lot.
```
