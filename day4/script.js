// Day 4: Note Editor with Live Counters and Theme Toggle

// Select all the elements
const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

// Updates both counters and the warning classes
function updateCounts() {
  const text = noteText.value;
  const totalChars = text.length;

  // Update character counter ("N / 200 characters")
  charCount.textContent = `${totalChars} / 200 characters`;

  // Update word counter ("N words")
  const trimmed = text.trim();
  const totalWords = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  wordCount.textContent = `${totalWords} words`;

  // Warning class when over 180 characters and over class when over 200
  if (totalChars > 200) {
    charCount.classList.remove("warning");
    charCount.classList.add("over");
  } else if (totalChars > 180) {
    charCount.classList.add("warning");
    charCount.classList.remove("over");
  } else {
    charCount.classList.remove("warning");
    charCount.classList.remove("over");
  }
}

// Clears textarea, counters, and removes draft from localStorage
function clearAll() {
  noteText.value = "";
  localStorage.removeItem("draft");
  updateCounts();
}

// Call updateCounts() and save the draft on every input event
noteText.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem("draft", noteText.value);
});

// Clear button clears everything
clearBtn.addEventListener("click", clearAll);

// Escape key inside textarea clears everything
noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearAll();
  }
});

// Theme button toggles dark mode, updates label, and remembers the choice
themeToggle.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

// When the page loads, restore any saved draft and theme, then call updateCounts()
function init() {
  // Restore theme
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
    themeToggle.textContent = "Light mode";
  } else {
    document.body.classList.remove("dark");
    themeToggle.textContent = "Dark mode";
  }

  // Restore draft
  const savedDraft = localStorage.getItem("draft");
  if (savedDraft !== null) {
    noteText.value = savedDraft;
  }

  // Call updateCounts()
  updateCounts();
}

init();
