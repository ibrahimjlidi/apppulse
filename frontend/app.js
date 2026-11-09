const taskList = document.querySelector('#task-list');
const taskForm = document.querySelector('#task-form');
const titleInput = document.querySelector('#task-title');
const descriptionInput = document.querySelector('#task-description');
const formHeading = document.querySelector('#form-heading');
const submitButton = document.querySelector('#submit-button');
const cancelEditButton = document.querySelector('#cancel-edit');
const notice = document.querySelector('#notice');
const healthDot = document.querySelector('#health-dot');
const healthLabel = document.querySelector('#health-label');

let tasks = [];
let editingId = null;

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    let message = `La requête a échoué (${response.status}).`;

    try {
      const body = await response.json();
      if (typeof body.error === 'string') {
        message = body.error;
      }
    } catch {
      // Keep the HTTP status message when the server does not return JSON.
    }

    throw new Error(message);
  }

  return response.status === 204 ? null : response.json();
}

function showNotice(message = '', isError = false) {
  notice.textContent = message;
  notice.classList.toggle('notice-error', isError);
}

function createTaskCard(task) {
  const card = document.createElement('article');
  card.className = `task-card${task.completed ? ' task-completed' : ''}`;

  const checkbox = document.createElement('input');
  checkbox.className = 'task-checkbox';
  checkbox.type = 'checkbox';
  checkbox.checked = task.completed;
  checkbox.setAttribute('aria-label', `Marquer « ${task.title} » comme terminée`);
  checkbox.addEventListener('change', () => updateTask(task.id, {
    completed: checkbox.checked
  }));

  const details = document.createElement('div');
  details.className = 'task-details';

  const title = document.createElement('h3');
  title.textContent = task.title;
  details.append(title);

  if (task.description) {
    const description = document.createElement('p');
    description.textContent = task.description;
    details.append(description);
  }

  const date = document.createElement('span');
  date.className = 'task-date';
  date.textContent = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium'
  }).format(new Date(task.createdAt));
  details.append(date);

  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const editButton = document.createElement('button');
  editButton.className = 'icon-button';
  editButton.type = 'button';
  editButton.textContent = 'Modifier';
  editButton.addEventListener('click', () => beginEdit(task));

  const deleteButton = document.createElement('button');
  deleteButton.className = 'icon-button icon-button-danger';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Supprimer';
  deleteButton.addEventListener('click', () => deleteTask(task));

  actions.append(editButton, deleteButton);
  card.append(checkbox, details, actions);
  return card;
}

function renderTasks() {
  taskList.replaceChildren();

  if (tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const title = document.createElement('strong');
    title.textContent = 'Aucune tâche pour le moment';
    const copy = document.createElement('p');
    copy.textContent = 'Ajoutez une tâche avec le formulaire pour commencer.';
    empty.append(title, copy);
    taskList.append(empty);
  } else {
    for (const task of tasks) {
      taskList.append(createTaskCard(task));
    }
  }

  const completed = tasks.filter((task) => task.completed).length;
  document.querySelector('#total-count').textContent = String(tasks.length);
  document.querySelector('#pending-count').textContent = String(tasks.length - completed);
  document.querySelector('#completed-count').textContent = String(completed);
}

async function loadTasks() {
  showNotice();
  try {
    const [taskData, health] = await Promise.all([
      request('/api/tasks'),
      request('/health')
    ]);

    tasks = taskData;
    renderTasks();
    healthDot.classList.add('health-online');
    healthLabel.textContent = health.database === 'connected'
      ? 'API et base connectées'
      : 'API disponible';
  } catch (error) {
    healthDot.classList.remove('health-online');
    healthLabel.textContent = 'Service indisponible';
    showNotice(error.message, true);
  }
}

function resetForm() {
  editingId = null;
  taskForm.reset();
  formHeading.textContent = 'Nouvelle tâche';
  submitButton.textContent = 'Ajouter la tâche';
  cancelEditButton.classList.add('hidden');
}

function beginEdit(task) {
  editingId = task.id;
  titleInput.value = task.title;
  descriptionInput.value = task.description ?? '';
  formHeading.textContent = 'Modifier la tâche';
  submitButton.textContent = 'Enregistrer';
  cancelEditButton.classList.remove('hidden');
  titleInput.focus();
  document.querySelector('.form-panel').scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
}

async function updateTask(id, changes) {
  try {
    await request(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes)
    });
    await loadTasks();
    showNotice('Tâche mise à jour.');
  } catch (error) {
    showNotice(error.message, true);
    await loadTasks();
  }
}

async function deleteTask(task) {
  if (!window.confirm(`Supprimer la tâche « ${task.title} » ?`)) {
    return;
  }

  try {
    await request(`/api/tasks/${task.id}`, { method: 'DELETE' });
    if (editingId === task.id) {
      resetForm();
    }
    await loadTasks();
    showNotice('Tâche supprimée.');
  } catch (error) {
    showNotice(error.message, true);
  }
}

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showNotice();

  const payload = {
    title: titleInput.value.trim(),
    description: descriptionInput.value.trim() || null
  };

  try {
    if (editingId === null) {
      await request('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showNotice('Tâche ajoutée.');
    } else {
      await request(`/api/tasks/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      showNotice('Tâche mise à jour.');
    }

    resetForm();
    await loadTasks();
  } catch (error) {
    showNotice(error.message, true);
  }
});

cancelEditButton.addEventListener('click', resetForm);
document.querySelector('#refresh-button').addEventListener('click', loadTasks);

loadTasks();
