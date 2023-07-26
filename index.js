const clocks = ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'];
const locUrl = new URL(window.location);
const { origin } = locUrl;
const endpoint = `${origin}/prompt`;
const button = document.getElementById('submit_prompt');
const clocksEle = document.getElementById('clocks');
const respMetrics = document.getElementById('response_metrics');
const promptEle = document.getElementById('prompt');
const respEle = document.getElementById('response');
const modelSelect = document.getElementById('model_select');
const modelLink = document.getElementById('model_link');

if (!respEle.setHTML) {
  respEle.setHTML = (html) => (respEle.innerHTML = html);
}

function selectOptionForModelName (modelName) {
  for (let i = 0; i < modelSelect.options.length; i++) {
    const opt = modelSelect.options[i];
    if (opt.id === modelName) {
      modelSelect.selectedIndex = i;
      modelSelect.disabled = true;
    }
  }
}

function renderResponse (promptId, response) {
  clocksEle.parentElement.style.display = 'none';
  modelSelect.disabled = true;
  promptEle.value = response.prompt;
  const hadLineBreak = response.response.indexOf('\n') !== -1;
  respEle.setHTML(response.response
    .replaceAll('>', '&gt;')
    .replaceAll('<', '&lt;')
    .replaceAll('\n', '<br/>'));

  if (hadLineBreak) {
    respEle.setHTML(respEle.innerHTML.replaceAll(' ', '&nbsp;'));
  }

  selectOptionForModelName(response.model);

  document.getElementById('response_lbl').style.display = 'block';
  respMetrics.textContent = `Chewing through this response took the 🦙🐪🐫 ${Number(response.elapsed_ms / 1000).toFixed(0)} seconds ` +
        `(${Number(response.ms_per_token / 1000).toFixed(2)}/s per token)`;
  if (window.location.search.indexOf('?id') === -1) {
    window.location.search = `?id=${promptId}`;
  }
}

async function promptAndWait (prompt, model, endpoint, promptSuccessCb, waitTickCb, promptId, waitTimeSeconds = 17) {
  let qPos;
  if (prompt && !promptId) {
    const promptRes = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ prompt, model })
    });

    if (!promptRes.ok) {
      console.error(promptRes.status, promptRes.statusText, endpoint, prompt);
      if (promptRes.status === 413) {
        promptEle.value = '';
        respMetrics.textContent = 'That prompt was too large! Please pair it down and try again...';
        return;
      }
      throw new Error(`bad prompt: ${promptRes.statusText}`);
    }

    const respJson = await promptRes.json();
    promptId = respJson.promptId;
    document.getElementById('queue_pos').innerText = (qPos = respJson.queuePosition) + 1;
    selectOptionForModelName(respJson.model);
  }

  const getUrl = `${endpoint}/${promptId}`;
  promptSuccessCb?.(promptId);

  let getStatus;
  let getResponse;
  do {
    const getRes = await fetch(getUrl);
    getStatus = getRes.status;
    waitTickCb?.();
    getResponse = await getRes.json();
    if (getStatus === 200 && getResponse?.queuePosition !== qPos) {
      document.getElementById('queue_pos').innerText = (qPos = getResponse.queuePosition) + 1;
    }
    await new Promise((resolve) => setTimeout(resolve, waitTimeSeconds * 1000));
  } while (getStatus === 202);

  return [promptId, getResponse];
}

async function main () {
  const models = await (await fetch(`${origin}/models`)).json();

  Object.entries(models)
    .forEach(([modelBin, { displayName, sourceURL }]) => {
      const newOpt = document.createElement('option');
      newOpt.id = modelBin;
      newOpt.innerText = displayName;
      modelLink.href = sourceURL;
      modelSelect.appendChild(newOpt);
    });

  modelSelect.addEventListener('change', (e) => {
    modelLink.href = models[e.target.selectedOptions[0].id].sourceURL;
  });

  modelSelect.selectedIndex = modelSelect.options.length - 1;

  const curPromptId = locUrl.searchParams.get('id') ?? window.localStorage.getItem('promptId');
  let tickCount = 0;

  const tick = () => {
    clocksEle.textContent = clocks[tickCount++ % clocks.length];
  };

  const ftCleanup = () => {
    button.parentElement?.removeChild(button);
    promptEle.disabled = true;
    promptEle.contentEditable = false;
    promptEle.value = window.localStorage.getItem('prompt') ?? '(loading...)';
    clocksEle.parentElement.style.display = 'block';
    const resetButton = document.getElementById('reset');
    resetButton.style.display = 'block';
    resetButton.addEventListener('click', () => {
      window.localStorage.removeItem('promptId');
      window.localStorage.removeItem('prompt');
      window.location.search = '';
    });
  };

  const firstTick = (promptId) => {
    ftCleanup();
    window.localStorage.setItem('promptId', promptId);
    tick();
  };

  if (curPromptId) {
    const getUrl = `${origin}/prompt/${curPromptId}`;
    const tryIt = await fetch(getUrl);
    if (tryIt.ok) {
      ftCleanup();
      if (tryIt.status === 200) {
        renderResponse(curPromptId, await tryIt.json(), getUrl);
        return;
      } else if (tryIt.status === 202) {
        const { prompt, model, queuePosition} = await tryIt.json();
        clocksEle.parentElement.style.display = 'block';
        window.localStorage.setItem('prompt', prompt);
        document.getElementById('queue_pos').innerText = queuePosition + 1;
        selectOptionForModelName(model);
        const [promptId, response] = await promptAndWait(null, modelSelect.selectedOptions[0].id, endpoint, firstTick, tick, curPromptId);
        renderResponse(promptId, response);
        return;
      }
    }
  }

  button.addEventListener('click', async () => {
    const prompt = promptEle.value;
    respMetrics.textContent = '';
    modelSelect.disabled = true;
    window.localStorage.setItem('prompt', prompt);
    const [promptId, response] = await promptAndWait(prompt, modelSelect.selectedOptions[0].id, endpoint, firstTick, tick);
    renderResponse(promptId, response);
  });
}

main();
