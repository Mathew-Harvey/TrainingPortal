let token = null;
let userRole = null;
let companyId = null;
let currentModule = null;
let currentSlide = 0;
let isRegister = false;
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}
function showLoading(show = true) {
  const spinner = document.getElementById('loading-spinner');
  if (spinner) spinner.style.display = show ? 'block' : 'none';
}
const show = (id) => {
  const element = document.getElementById(id);
  if (!element) {
    console.error(`Element with ID '${id}' not found`);
    return;
  }
  document.querySelectorAll('.container').forEach(el => el.classList.add('hidden'));
  element.classList.remove('hidden');
};
function toggleAuth() {
  isRegister = !isRegister;
  const authTitle = document.getElementById('auth-title');
  const authButton = document.getElementById('auth-button');
  const nameInput = document.getElementById('name');
  const roleSelect = document.getElementById('role');
  const toggleLink = document.getElementById('toggle-auth');
  if (!authTitle || !authButton || !nameInput || !roleSelect || !toggleLink) {
    console.error('Missing DOM element for toggleAuth');
    return;
  }
  if (isRegister) {
    authTitle.textContent = 'Register';
    authButton.textContent = 'Register';
    nameInput.classList.remove('hidden');
    roleSelect.classList.remove('hidden');
    toggleLink.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuth()">Login</a>';
  } else {
    authTitle.textContent = 'Login';
    authButton.textContent = 'Login';
    nameInput.classList.add('hidden');
    roleSelect.classList.add('hidden');
    toggleLink.innerHTML = 'Don\'t have an account? <a href="#" onclick="toggleAuth()">Register</a>';
  }
}
document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const name = document.getElementById('name').value;
  const role = document.getElementById('role').value;
  showLoading(true);
  if (isRegister) {
    try {
      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showNotification('Registration successful! Please log in.');
      toggleAuth();
    } catch (error) {
      showNotification(error.message, 'error');
    }
  } else {
    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      token = data.token;
      userRole = data.role;
      companyId = data.companyId;
      show('dashboard');
      renderDashboard();
    } catch (error) {
      showNotification(error.message, 'error');
    }
  }
  showLoading(false);
});
document.getElementById('logout').addEventListener('click', () => {
  if (confirm('Are you sure you want to log out?')) {
    token = null;
    userRole = null;
    companyId = null;
    show('auth');
  }
});
async function renderDashboard() {
  const content = document.getElementById('content');
  if (!content) return console.error('Content element not found');
  showLoading(true);
  if (userRole === 'superadmin') {
    content.innerHTML = `
      <h2>Manage Companies</h2>
      <button id="add-company">Add Company</button>
      <div id="companies-list"></div>
    `;
    document.getElementById('add-company').addEventListener('click', addCompany);
    try {
      const res = await fetch('/companies', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Failed to fetch companies: ${res.status}`);
      const companies = await res.json();
      const companiesList = document.getElementById('companies-list');
      if (companiesList) {
        companiesList.innerHTML = companies.map(c => `
          <div class="company-card">
            <h3>${c.name}</h3>
            <p>Staff: <span class="staff-count">${c.userCount || 0}</span> | Modules: <span class="module-count">${c.moduleCount || 0}</span></p>
            <button onclick="manageCompany('${c._id}', '${c.name}')">Manage</button>
            <button onclick="viewCompanyDetails('${c._id}')">View Details</button>
          </div>
        `).join('');
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
      document.getElementById('companies-list').innerHTML = '<p>Failed to load companies.</p>';
    }
  } else if (userRole === 'companyadmin') {
    show('company-management');
    renderCompanyManagement(companyId);
  } else {
    content.innerHTML = '<h2>Your Modules</h2><div id="modules"></div>';
    await renderModules();
  }
  showLoading(false);
}
async function viewCompanyDetails(companyId) {
  showLoading(true);
  try {
    const companyRes = await fetch(`/companies/${companyId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!companyRes.ok) throw new Error(`Failed to fetch company: ${companyRes.status}`);
    const company = await companyRes.json();
    const usersRes = await fetch('/users', { headers: { Authorization: `Bearer ${token}` } });
    if (!usersRes.ok) throw new Error(`Failed to fetch users: ${usersRes.status}`);
    const users = (await usersRes.json()).filter(u => u.companyId?.toString() === companyId.toString());
    const modulesRes = await fetch('/modules', { headers: { Authorization: `Bearer ${token}` } });
    if (!modulesRes.ok) throw new Error(`Failed to fetch modules: ${modulesRes.status}`);
    const modules = (await modulesRes.json()).filter(m => m.companyId?.toString() === companyId.toString());
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = `
        <h2>${company.name} Details</h2>
        <h3>Staff</h3>
        <div id="company-users" class="grid-layout"></div>
        <h3>Modules</h3>
        <div id="company-modules" class="grid-layout"></div>
        <button onclick="renderDashboard()">Back</button>
      `;
      document.getElementById('company-users').innerHTML = users.length ? users.map(u => `
        <div class="user-card">
          <h4>${u.name} (${u.role})</h4>
          <p>Email: ${u.email}</p>
        </div>
      `).join('') : '<p>No staff found.</p>';
      document.getElementById('company-modules').innerHTML = modules.length ? modules.map(m => `
        <div class="module-card">
          <h4>${m.title}</h4>
          <p>Slides: ${m.slidesHtml?.length || 0}</p>
          <button onclick="viewModule('${m._id}')">View</button>
        </div>
      `).join('') : '<p>No modules found.</p>';
    }
  } catch (error) {
    console.error('Error fetching company details:', error);
    const content = document.getElementById('content');
    if (content) content.innerHTML = `<p>Error loading details: ${error.message}</p><button onclick="renderDashboard()">Back</button>`;
  }
  showLoading(false);
}
async function addCompany() {
  const companyName = prompt('Enter company name:');
  if (!companyName) return;
  showLoading(true);
  try {
    const res = await fetch('/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: companyName })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderDashboard();
    showNotification('Company added successfully!');
  } catch (error) {
    console.error('Error adding company:', error);
    showNotification(`Failed to add company: ${error.message}`, 'error');
  }
  showLoading(false);
}
async function manageCompany(companyId, companyName) {
  show('company-management');
  const companyNameElement = document.getElementById('company-name');
  if (companyNameElement) companyNameElement.textContent = companyName;
  renderCompanyManagement(companyId);
}
async function renderCompanyManagement(companyId = null) {
  const content = document.getElementById('company-content');
  if (!content) return console.error('Company content element not found');
  content.innerHTML = `
    <h3>Manage Users</h3>
    <form id="add-user-form" class="form-group">
      <input type="text" id="user-name" placeholder="User Name" required>
      <input type="email" id="user-email" placeholder="User Email" required>
      <input type="password" id="user-password" placeholder="User Password" required>
      <select id="user-role">
        <option value="companyadmin">Company Admin</option>
        <option value="user">User</option>
      </select>
      <button type="submit">Add User</button>
    </form>
    <div id="users-list" class="grid-layout"></div>
    <h3>Manage Modules</h3>
    <div class="module-upload-area">
      <h4>Upload Training Module</h4>
      <button id="upload-button">Browse Files</button>
      <input type="file" id="file-input" accept=".pptx" style="display:none">
      <input type="text" id="module-title" placeholder="Module Title (optional)" class="module-input">
      <button id="submit-module" class="module-button" disabled>Upload Module</button>
      <div id="upload-progress" class="progress-bar hidden">Uploading... <div id="progress-fill"></div></div>
    </div>
    <div id="modules" class="grid-layout">
      <h4>View Training Modules</h4>
    </div>
    <h3>Completion Status</h3>
    <div id="completion-table"></div>
  `;
  const backButton = document.getElementById('back-to-dashboard');
  if (backButton) backButton.addEventListener('click', () => { show('dashboard'); renderDashboard(); });
  const addUserForm = document.getElementById('add-user-form');
  if (addUserForm) {
    addUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userName = document.getElementById('user-name').value;
      const userEmail = document.getElementById('user-email').value;
      const userPassword = document.getElementById('user-password').value;
      const userRole = document.getElementById('user-role').value;
      await addUser(companyId, userName, userEmail, userPassword, userRole);
      addUserForm.reset();
      renderCompanyManagement(companyId);
    });
  }
  const uploadButton = document.getElementById('upload-button');
  const fileInput = document.getElementById('file-input');
  const submitModuleButton = document.getElementById('submit-module');
  if (uploadButton && fileInput) uploadButton.addEventListener('click', () => fileInput.click());
  if (fileInput && submitModuleButton) {
    fileInput.addEventListener('change', () => { submitModuleButton.disabled = !fileInput.files.length; });
    submitModuleButton.addEventListener('click', async () => {
      if (fileInput.files.length > 0) {
        await uploadModule(fileInput.files[0], companyId);
        fileInput.value = '';
        document.getElementById('module-title').value = '';
        submitModuleButton.disabled = true;
        renderCompanyManagement(companyId);
      }
    });
  }
  try {
    const usersRes = await fetch('/users', { headers: { Authorization: `Bearer ${token}` } });
    if (!usersRes.ok) throw new Error(`Failed to fetch users: ${usersRes.status}`);
    const users = await usersRes.json();
    const filteredUsers = users.filter(u => u.companyId?.toString() === companyId?.toString());
    document.getElementById('users-list').innerHTML = filteredUsers.length ? filteredUsers.map(u => `
      <div class="module-card">
        <h3>${u.name} (${u.role})</h3>
        <p>Email: ${u.email}</p>
      </div>
    `).join('') : '<p>No users found.</p>';
    const modulesRes = await fetch('/modules', { headers: { Authorization: `Bearer ${token}` } });
    if (!modulesRes.ok) throw new Error(`Failed to fetch modules: ${modulesRes.status}`);
    const modules = (await modulesRes.json()).filter(m => m.companyId?.toString() === companyId?.toString());
    const modulesElement = document.getElementById('modules');
    if (modulesElement) {
      modulesElement.innerHTML = `<h4>View Training Modules</h4>` + (modules.length ? modules.map(m => `
        <div class="module-card" data-id="${m._id}">
          <h3>${m.title}</h3>
          <p>Slides: ${m.slidesHtml?.length || 0}</p>
          <button onclick="viewModule('${m._id}')">${userRole === 'user' ? 'Start' : 'View'}</button>
          <button onclick="editModuleTitle('${m._id}', '${m.title}')">Edit Title</button>
          <button onclick="deleteModule('${m._id}', '${m.title}')">Delete</button>
        </div>
      `).join('') : '<p>No modules found.</p>');
    }
    const completionsRes = await fetch(`/completions/company/${companyId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!completionsRes.ok) throw new Error(`Failed to fetch completions: ${completionsRes.status}`);
    const completions = await completionsRes.json();
    const completionTable = document.getElementById('completion-table');
    if (completionTable && completions.length && filteredUsers.length && modules.length) {
      completionTable.innerHTML = `
        <table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="border: 1px solid #ccc; padding: 8px;">User</th>
              ${modules.map(m => `<th style="border: 1px solid #ccc; padding: 8px;">${m.title}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${filteredUsers.map(u => `
              <tr>
                <td style="border: 1px solid #ccc; padding: 8px;">${u.name}</td>
                ${modules.map(m => {
                  const completion = completions.find(c => c.userId.toString() === u._id.toString() && c.moduleId.toString() === m._id.toString());
                  return `<td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${completion ? (completion.passed ? '✅' : '❌') : '—'}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      completionTable.innerHTML = '<p>No completion data available.</p>';
    }
  } catch (error) {
    console.error('Error rendering company management:', error);
    content.innerHTML += `<p>Error: ${error.message}</p>`;
  }
}
async function addUser(companyId, name, email, password, role) {
  try {
    const res = await fetch('/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name, email, password, role, companyId })
    });
    const data = await res.json();
    if (res.ok) {
      showNotification('User added successfully!');
    } else {
      throw new Error(data.error || 'Failed to add user');
    }
  } catch (error) {
    console.error('Error adding user:', error);
    showNotification(`Failed to add user: ${error.message}`, 'error');
  }
}
async function uploadModule(file, companyId) {
  const formData = new FormData();
  const moduleTitle = document.getElementById('module-title')?.value.trim() || '';
  formData.append('pptx', file);
  const progressFill = document.getElementById('progress-fill');
  const uploadProgress = document.getElementById('upload-progress');
  if (progressFill && uploadProgress) {
    uploadProgress.classList.remove('hidden');
    progressFill.style.width = '0%';
  }
  try {
    const res = await fetch('/upload-pptx', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const data = await res.json();
    const moduleRes = await fetch('/modules', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        title: moduleTitle || `Untitled Module - ${new Date().toISOString().split('T')[0]}`,
        companyId: companyId,
        slidesHtml: data.slides
      })
    });
    if (!moduleRes.ok) throw new Error(`Module save failed: ${moduleRes.status}`);
    if (progressFill) progressFill.style.width = '100%';
    setTimeout(() => {
      if (uploadProgress) uploadProgress.classList.add('hidden');
      if (progressFill) progressFill.style.width = '0%';
    }, 1000);
    showNotification('Module uploaded successfully!');
    renderCompanyManagement(companyId);
  } catch (error) {
    console.error('Error uploading module:', error);
    showNotification(`Failed to upload module: ${error.message}`, 'error');
  }
}
async function renderModules(companyId = null) {
  const res = await fetch('/modules', { headers: { Authorization: `Bearer ${token}` } });
  const modules = await res.json();
  const filteredModules = companyId ? modules.filter(m => m.companyId?.toString() === companyId.toString()) : modules;
  const modulesElement = document.getElementById('modules');
  if (modulesElement) {
    modulesElement.innerHTML = filteredModules.map(m => `
      <div class="module-card" data-id="${m._id}">
        <h3>${m.title}</h3>
        <p>Slides: ${m.slidesHtml?.length || 0}</p>
        <button onclick="viewModule('${m._id}')">Start</button>
      </div>
    `).join('');
  }
}
async function viewModule(moduleId) {
  try {
    const res = await fetch(`/modules/${moduleId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Failed to fetch module: ${res.status}`);
    currentModule = await res.json();
    currentSlide = 0;
    document.getElementById('module-viewer').classList.remove('hidden');
    document.getElementById('module-title').textContent = currentModule.title;
    renderSlide();
    if (userRole === 'companyadmin') {
      const saveButton = document.getElementById('save-slide');
      saveButton.classList.remove('hidden');
      saveButton.onclick = async () => {
        const slideHtml = document.getElementById('slides').innerHTML;
        try {
          const res = await fetch(`/modules/${currentModule._id}/slides/${currentSlide}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ html: slideHtml })
          });
          if (!res.ok) throw new Error('Failed to save slide');
          showNotification('Slide saved successfully!');
        } catch (error) {
          console.error('Error saving slide:', error);
          showNotification('Failed to save slide', 'error');
        }
      };
      const deleteSlideButton = document.getElementById('delete-slide');
      deleteSlideButton.classList.remove('hidden');
      deleteSlideButton.onclick = async () => {
        if (confirm('Are you sure you want to delete this slide?')) {
          try {
            const res = await fetch(`/modules/${currentModule._id}/slides/${currentSlide}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to delete slide');
            currentModule.slidesHtml.splice(currentSlide, 1);
            if (currentSlide >= currentModule.slidesHtml.length) currentSlide = currentModule.slidesHtml.length - 1;
            renderSlide();
            showNotification('Slide deleted successfully!');
          } catch (error) {
            console.error('Error deleting slide:', error);
            showNotification('Failed to delete slide', 'error');
          }
        }
      };
    }
  } catch (error) {
    console.error('Error viewing module:', error);
    showNotification(`Error: ${error.message}`, 'error');
  }
}
function renderSlide() {
  const slides = document.getElementById('slides');
  if (slides) {
    const slideContent = currentModule.slidesHtml[currentSlide];
    slides.innerHTML = slideContent;
  }
  const progress = document.getElementById('progress');
  if (progress) {
    const progressWidth = ((currentSlide + 1) / currentModule.slidesHtml.length) * 100;
    progress.style.width = `${progressWidth}%`;
  }
  document.getElementById('prev-slide').disabled = currentSlide === 0;
  document.getElementById('next-slide').disabled = currentSlide === currentModule.slidesHtml.length - 1;
}
async function editModuleTitle(moduleId, currentTitle) {
  const newTitle = prompt('Enter new module title:', currentTitle);
  if (newTitle && newTitle.trim()) {
    try {
      const res = await fetch(`/modules/${moduleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: newTitle.trim() })
      });
      if (!res.ok) throw new Error(`Failed to update module: ${res.status}`);
      const updatedModule = await res.json();
      showNotification('Module title updated successfully!');
      renderCompanyManagement(companyId);
    } catch (error) {
      console.error('Error updating module title:', error);
      showNotification(`Error: ${error.message}`, 'error');
    }
  }
}
async function deleteModule(moduleId, title) {
  if (confirm(`Are you sure you want to delete the module "${title}"?`)) {
    try {
      const res = await fetch(`/modules/${moduleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete module');
      showNotification('Module deleted successfully!');
      renderCompanyManagement(companyId);
    } catch (error) {
      console.error('Error deleting module:', error);
      showNotification(`Error: ${error.message}`, 'error');
    }
  }
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('prev-slide').addEventListener('click', () => {
    if (currentSlide > 0) {
      currentSlide--;
      renderSlide();
    }
  });
  document.getElementById('next-slide').addEventListener('click', () => {
    if (currentSlide < currentModule.slidesHtml.length - 1) {
      currentSlide++;
      renderSlide();
    }
  });
  document.getElementById('toggle-theme').addEventListener('click', () => {
    document.body.classList.toggle('dark');
  });
  document.getElementById('toggle-theme-company').addEventListener('click', () => {
    document.body.classList.toggle('dark');
  });
});
show('auth');
