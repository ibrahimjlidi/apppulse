import assert from 'node:assert/strict';
import test from 'node:test';

const baseUrl = (process.env.API_BASE_URL ?? 'http://localhost:8081').replace(
  /\/$/,
  ''
);

test('API supports the task CRUD lifecycle and validates requests', async () => {
  const healthResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    status: 'ok',
    database: 'connected'
  });

  const invalidCreateResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '   ' })
  });
  assert.equal(invalidCreateResponse.status, 400);

  let taskId;

  try {
    const createResponse = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'AppPulse integration test',
        description: 'Temporary test task'
      })
    });

    assert.equal(createResponse.status, 201);
    const createdTask = await createResponse.json();
    taskId = createdTask.id;
    assert.equal(createdTask.title, 'AppPulse integration test');
    assert.equal(createdTask.description, 'Temporary test task');
    assert.equal(createdTask.completed, false);

    const getResponse = await fetch(`${baseUrl}/api/tasks/${taskId}`);
    assert.equal(getResponse.status, 200);
    assert.equal((await getResponse.json()).id, taskId);

    const updateResponse = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true })
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).completed, true);

    const listResponse = await fetch(`${baseUrl}/api/tasks`);
    assert.equal(listResponse.status, 200);
    const tasks = await listResponse.json();
    assert.ok(tasks.some((task) => task.id === taskId && task.completed));

    const deleteResponse = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: 'DELETE'
    });
    assert.equal(deleteResponse.status, 204);
    taskId = undefined;

    const missingTaskResponse = await fetch(`${baseUrl}/api/tasks/999999999`);
    assert.equal(missingTaskResponse.status, 404);
  } finally {
    if (taskId !== undefined) {
      const cleanupResponse = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
        method: 'DELETE'
      });

      assert.ok(
        cleanupResponse.status === 204 || cleanupResponse.status === 404,
        `Unexpected cleanup response: ${cleanupResponse.status}`
      );
    }
  }
});
