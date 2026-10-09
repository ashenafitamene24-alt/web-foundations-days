let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

function searchNotes(word) {
  return notes.filter(note => note.text.toLowerCase().includes(word.toLowerCase()));
}

function longestNote() {
  if (notes.length === 0) return null;
  return notes.reduce((longest, current) => current.text.length > longest.text.length ? current : longest);
}

function countByCategory() {
  let counts = {};
  for (let note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }
  return counts;
}

function getSummary() {
  let counts = countByCategory();
  let totalNotes = notes.length;
  let summaryParts = [];
  for (let category in counts) {
    summaryParts.push(`${counts[category]} ${category}`);
  }
  let noteWord = totalNotes === 1 ? "note" : "notes";
  return `${totalNotes} ${noteWord}: ${summaryParts.join(", ")}.`;
}

function isDuplicate(text) {
  let normalizedText = text.trim().toLowerCase();
  return notes.some(note => note.text.trim().toLowerCase() === normalizedText);
}

function addNote(text, category) {
  let validCategories = ["personal", "work", "study"];
  if (typeof text !== "string" || text.length < 1 || text.length > 200) {
    console.log("Failed to add note: Text must be between 1 and 200 characters.");
    return false;
  }
  if (!validCategories.includes(category)) {
    console.log(`Failed to add note: Invalid category '${category}'.`);
    return false;
  }
  if (isDuplicate(text)) {
    console.log("Failed to add note: Duplicate note found.");
    return false;
  }
  let newId = notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1;
  notes.push({ id: newId, text: text.trim(), category: category });
  console.log(`Successfully added note: "${text.trim()}"`);
  return true;
}

// Tests
console.log(searchNotes("study"));
console.log(longestNote());
console.log(countByCategory());
console.log(getSummary());
console.log(isDuplicate("call mum"));
console.log(addNote("Go for a run", "personal"));
