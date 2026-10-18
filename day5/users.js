// Day 5: Asynchronous User Directory with Live Filtering

const loadUsersBtn = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusP = document.getElementById("status");
const usersList = document.getElementById("users-list");

// Store the loaded users in an array
let users = [];

// Renders an array of user objects to the DOM using createElement and textContent
function renderUsers(list) {
  // Clear the existing list contents
  usersList.innerHTML = "";

  // Show "No users match your filter." when nothing matches
  if (list.length === 0) {
    if (users.length > 0) {
      const noMatchItem = document.createElement("li");
      noMatchItem.className = "no-match";
      noMatchItem.textContent = "No users match your filter.";
      usersList.appendChild(noMatchItem);
    }
    return;
  }

  // Draw each user's name, email, city, and company name
  list.forEach((user) => {
    const li = document.createElement("li");

    const nameHeading = document.createElement("h3");
    nameHeading.textContent = user.name;

    const emailParagraph = document.createElement("p");
    emailParagraph.textContent = `Email: ${user.email}`;

    const cityParagraph = document.createElement("p");
    const city = user.address && user.address.city ? user.address.city : (user.city || "Unknown");
    cityParagraph.textContent = `City: ${city}`;

    const companyParagraph = document.createElement("p");
    const company = user.company && user.company.name ? user.company.name : (user.company || "Unknown");
    companyParagraph.textContent = `Company: ${company}`;

    li.appendChild(nameHeading);
    li.appendChild(emailParagraph);
    li.appendChild(cityParagraph);
    li.appendChild(companyParagraph);

    usersList.appendChild(li);
  });
}

// Fetches users from the API using async / await and try / catch / finally
async function loadUsers() {
  // Disable button and show loading status
  loadUsersBtn.disabled = true;
  statusP.textContent = "Loading users...";

  try {
    const response = await fetch("https://jsonplaceholder.typicode.com/users");

    // Check response.ok
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    users = await response.json();
    renderUsers(users);
    statusP.textContent = `Successfully loaded ${users.length} users.`;
    filterInput.value = "";
  } catch (error) {
    statusP.textContent = `Failed to load users: ${error.message}`;
    users = [];
    renderUsers(users);
  } finally {
    // Re-enable button when request completes
    loadUsersBtn.disabled = false;
  }
}

// Event Listeners

// Button click to fetch users
loadUsersBtn.addEventListener("click", loadUsers);

// Input event on the filter box: filter stored array without making a new network request
filterInput.addEventListener("input", () => {
  const query = filterInput.value.trim().toLowerCase();
  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(query)
  );

  renderUsers(filteredUsers);

  if (users.length > 0) {
    if (filteredUsers.length === 0) {
      statusP.textContent = "No users match your filter.";
    } else {
      statusP.textContent = `Showing ${filteredUsers.length} of ${users.length} users.`;
    }
  }
});
