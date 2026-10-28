
const API_URL = "/chat";

const $ = (id) => document.getElementById(id);

const chatOverlay = $("chatOverlay");
const chatMessages = $("chatMessages");
const chatForm = $("chatForm");
const chatInput = $("chatInput");
const sendBtn = $("sendBtn");
const typing = $("typing");
const toast = $("toast");

let history = [];
let isStreaming = false;
let activeController = null;
let toastTimer;

// ----------------------------------------
// CHAT OPEN / CLOSE
// ----------------------------------------

function openChat() {
    chatOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    chatInput.focus();
}

function closeChat() {
    chatOverlay.hidden = true;
    document.body.style.overflow = "";
}

$("dockAsk").addEventListener("click", openChat);
$("heroAsk").addEventListener("click", openChat);
$("closeChat").addEventListener("click", closeChat);

chatOverlay.addEventListener("click", (event) => {
    if (event.target === chatOverlay) closeChat();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !chatOverlay.hidden) {
        closeChat();
    }
});

// ----------------------------------------
// NOTIFICATIONS
// ----------------------------------------

function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, 3500);
}

// ----------------------------------------
// DESKTOP WINDOWS
// ----------------------------------------

const infoPages = {
    about: {
        title: "About Me",
        content: `
            <h3>Developer & AI Enthusiast</h3>
            <p>Welcome to my digital portfolio!</p>
            <p>Ask my AI assistant about my background,
            interests, and experience.</p>
        `
    },

    skills: {
        title: "Technical Skills",
        content: `
            <h3>My Technical Skills</h3>
            <p>Ask my AI assistant about my programming,
            backend development, databases, and AI projects.</p>
        `
    },

    contact: {
        title: "Contact",
        content: `
            <h3>Let's connect!</h3>
            <p>Interested in working together?</p>
            <p>Update the email address in script.js
            with your actual contact details.</p>
        `
    }
};

function openWindow(name) {
    $("projectsWindow").hidden = name !== "projects";
    $("infoWindow").hidden = !infoPages[name];

    if (name === "home") {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
    }

    if (infoPages[name]) {
        $("infoTitle").textContent = infoPages[name].title;
        $("infoContent").innerHTML = infoPages[name].content;
    }
}

document.querySelectorAll("[data-window]").forEach((button) => {
    button.addEventListener("click", () => {
        openWindow(button.dataset.window);
    });
});

document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
        $(button.dataset.close).hidden = true;
    });
});

document.querySelector('a[href="#projects"]').addEventListener(
    "click",
    (event) => {
        event.preventDefault();
        openWindow("projects");
    }
);

document.querySelector('a[href="#contact"]').addEventListener(
    "click",
    (event) => {
        event.preventDefault();
        openWindow("contact");
    }
);

// Resume opens directly from the href in index.html.
// No click handler is needed.

// ----------------------------------------
// CHAT MESSAGES
// ----------------------------------------

function addMessage(role, text = "") {
    const wrapper = document.createElement("div");
    wrapper.className = `message ${role}`;

    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = role === "user" ? "You" : "Samadhan AI";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = text;

    wrapper.append(label, bubble);
    chatMessages.appendChild(wrapper);

    scrollChat();

    return bubble;
}

function scrollChat() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeWelcome() {
    chatMessages.querySelector(".welcome-message")?.remove();
}

function resetChatUI() {
    chatMessages.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">✦</div>
            <h3>Hey there! 👋</h3>
            <p>
                I'm Samadhan's AI assistant.
                Ask me about projects, skills, or experience.
            </p>
            <div class="suggestions">
                <button data-question="Tell me about Samadhan's projects">
                    🚀 Explore his projects
                </button>
                <button data-question="What technical skills does Samadhan have?">
                    💻 Technical skills
                </button>
                <button data-question="Tell me about Samadhan">
                    👋 About Samadhan
                </button>
            </div>
        </div>
    `;
}

// ----------------------------------------
// STREAMING CHAT
// ----------------------------------------

async function askAI(question) {
    if (isStreaming) return;

    isStreaming = true;
    sendBtn.disabled = true;
    typing.hidden = false;

    removeWelcome();
    addMessage("user", question);

    const bubble = addMessage("assistant");
    bubble.classList.add("streaming");

    let answer = "";
    let finished = false;
    let buffer = "";

    activeController = new AbortController();

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "text/event-stream"
            },
            body: JSON.stringify({
                message: question,
                history: history
            }),
            signal: activeController.signal
        });

        if (!response.ok) {
            throw new Error(
                `Backend error: HTTP ${response.status}`
            );
        }

        if (!response.body) {
            throw new Error("Streaming is not supported by this browser.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        function processEvent(eventText) {
            const lines = eventText.split(/\r?\n/);
            const data = lines
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).replace(/^ /, ""))
                .join("\n");

            if (!data) return;

            if (data.trim() === "[DONE]") {
                finished = true;
                return;
            }

            let payload;

            try {
                payload = JSON.parse(data);
            } catch {
                throw new Error("Received an invalid streaming event.");
            }

            if (payload.error) {
                throw new Error(payload.error);
            }

            if (typeof payload.content === "string") {
                answer += payload.content;

                // Render every received chunk immediately.
                bubble.textContent = answer;
                typing.hidden = true;
                scrollChat();
            }
        }

        while (!finished) {
            const { value, done } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // SSE events are separated by a blank line.
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() || "";

            for (const eventText of events) {
                processEvent(eventText);

                if (finished) break;
            }
        }

        buffer += decoder.decode();

        if (!finished && buffer.trim()) {
            processEvent(buffer);
        }

        if (!answer.trim()) {
            throw new Error("The AI returned an empty response.");
        }

        // Keep the conversation for the next question.
        history.push(
            { role: "user", content: question },
            { role: "assistant", content: answer }
        );

    } catch (error) {
        if (error.name === "AbortError") {
            if (answer.trim()) {
                history.push(
                    { role: "user", content: question },
                    { role: "assistant", content: answer }
                );
            } else {
                bubble.textContent = "Response cancelled.";
            }
        } else {
            console.error("Portfolio AI error:", error);

            bubble.textContent =
                "Unable to get a response. Make sure the FastAPI " +
                "server is running and the Groq API key is valid.";

            showToast(error.message || "Connection failed.");
        }
    } finally {
        bubble.classList.remove("streaming");
        typing.hidden = true;
        sendBtn.disabled = false;
        isStreaming = false;
        activeController = null;
        scrollChat();
    }
}

// ----------------------------------------
// SEND MESSAGES
// ----------------------------------------

chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const question = chatInput.value.trim();

    if (!question || isStreaming) return;

    chatInput.value = "";
    chatInput.style.height = "auto";

    await askAI(question);
});

// Enter sends; Shift + Enter adds a new line.
chatInput.addEventListener("keydown", (event) => {
    if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.isComposing
    ) {
        event.preventDefault();
        chatForm.requestSubmit();
    }
});

// Automatically resize the text box.
chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height =
        Math.min(chatInput.scrollHeight, 110) + "px";
});

// Suggested questions.
chatMessages.addEventListener("click", (event) => {
    const button = event.target.closest("[data-question]");

    if (!button || isStreaming) return;

    chatInput.value = button.dataset.question;
    openChat();
    chatForm.requestSubmit();
});

// Start a fresh conversation.
$("newChat").addEventListener("click", () => {
    if (isStreaming) {
        // Stop the active HTTP stream before resetting the chat.
        activeController?.abort();
    }

    history = [];
    resetChatUI();
    chatInput.focus();
});
