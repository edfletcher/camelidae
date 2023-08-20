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
const preDiv = document.getElementById('preprompt_div');
const postDiv = document.getElementById('postprompt_div');
const prePrompt = document.getElementById('preprompt');
const postPrompt = document.getElementById('postprompt');
const motdEle = document.getElementById('motd_cont');

if (!respEle.setHTML) {
  const setHTMLfill = (ele, html) => (ele.innerHTML = html);
  respEle.setHTML = setHTMLfill.bind(null, respEle);
  motdEle.setHTML = setHTMLfill.bind(null, motdEle);
}

const ue = (s) => s.replaceAll(/\\n/g, '\n');
const es = (s) => s.replaceAll(/\n/g, '\\n');

function selectOptionForModelName(modelName) {
  for (let i = 0; i < modelSelect.options.length; i++) {
    const opt = modelSelect.options[i];
    if (opt.id === modelName) {
      modelSelect.selectedIndex = i;
      modelSelect.disabled = true;
    }
  }
}

function renderResponse(promptId, response) {
  motdEle.parentElement.style.display =
    clocksEle.parentElement.style.display = 'none';
  modelSelect.disabled = true;
  document.getElementById('response_cont').style.display = 'block';
  document.getElementById('model_used').textContent = 'used';
  document.getElementById('prompt_id').href = `/?id=${promptId}`;
  promptEle.value = response.prompt;
  respEle.setHTML(marked.parse(response.response));
  selectOptionForModelName(response.model);
  document.getElementById('response_lbl').style.display = 'block';
  respMetrics.textContent = 'Chewing through this response took the 🦙🐪🐫 ' +
    `${Number(response.elapsed_ms / 1000).toFixed(0)} seconds ` +
    `(${Number(response.ms_per_token / 1000).toFixed(2)}/s per token)`;
  if (window.location.search.indexOf('?id') === -1) {
    window.location.search = `?id=${promptId}`;
  }
}

async function promptAndWait(prompt, model, endpoint, promptSuccessCb, waitTickCb, promptId, waitTimeSeconds = 7) {
  let qPos;
  if (prompt && !promptId) {
    const promptRes = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        model,
        promptWrappers: {
          pre: ue(prePrompt.value),
          post: ue(postPrompt.value)
        },
        mirostat: document.getElementById('use_mirostat').checked ? 2 : 0,
        priority: document.getElementById('high_pri').checked ? 'HIGH' : 'NORMAL'
      })
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
  document.getElementById('perma_ele').href = `${origin}/?id=${promptId}`;

  let getStatus;
  let getResponse;
  do {
    const getRes = await fetch(getUrl);
    getStatus = getRes.status;
    waitTickCb?.();
    getResponse = await getRes.json();
    if (getResponse?.queuePosition !== qPos) {
      qPos = getResponse?.queuePosition;
      if (qPos === -1) {
        document.getElementById('queued_span').style.display = 'none';
        document.getElementById('processing_span').style.display = 'inline';
      } else if (qPos) {
        document.getElementById('queue_pos').innerText = (qPos = getResponse.queuePosition) + 1;
      } else {
        console.error('no qPos?', qPos, getResponse);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, waitTimeSeconds * 1000));
  } while (getStatus === 202);

  return [promptId, getResponse];
}

function modelSelector(models, e) {
  const modelSpec = models[e.target.selectedOptions[0].id];
  modelLink.href = modelSpec.sourceURL;
  prePrompt.value = es(modelSpec.promptWrappers?.pre ?? '');
  postPrompt.value = es(modelSpec.promptWrappers?.post ?? '');
  const modelDesc = document.getElementById('model_desc');
  if (modelSpec?.description) {
    modelDesc.textContent = modelSpec.description;
    modelDesc.style.display = 'block';
  } else {
    modelDesc.style.display = 'none';
  }
}

async function main() {
  fetch('/motd')
    .then(async (motd) => {
      if (motd.ok) {
        motdEle.setHTML(await motd.text());
      }
    })
    .catch(console.error);

  const models = await (await fetch(`${origin}/models`)).json();

  Object.entries(models)
    .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName))
    .forEach(([modelBin, { displayName, sourceURL }]) => {
      const newOpt = document.createElement('option');
      newOpt.id = modelBin;
      newOpt.innerText = displayName;
      modelLink.href = sourceURL;
      modelSelect.appendChild(newOpt);
    });

  modelSelect.addEventListener('change', modelSelector.bind(null, models));
  modelSelect.selectedIndex = 0;
  modelSelector(models, { target: modelSelect });

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
    preDiv.style.display = 'none';
    postDiv.style.display = 'none';
    document.getElementById('options_cont').parentElement.style.display = 'none'; // should really keep mirostat shown but disabled...
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
        const { prompt, model, queuePosition } = await tryIt.json();
        clocksEle.parentElement.style.display = 'block';
        window.localStorage.setItem('prompt', prompt);
        modelSelect.selectedIndex = [...modelSelect.options].findIndex((m) => m.id === model);
        modelSelector(models, { target: modelSelect });
        if (queuePosition === -1) {
          document.getElementById('queued_span').style.display = 'none';
          document.getElementById('processing_span').style.display = 'inline';
        } else {
          document.getElementById('queue_pos').innerText = queuePosition + 1;
        }
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
    window.localStorage.setItem('prompt', ue(prePrompt.value) + prompt + ue(postPrompt.value));
    const [promptId, response] = await promptAndWait(prompt, modelSelect.selectedOptions[0].id, endpoint, firstTick, tick);
    renderResponse(promptId, response);
  });
}

main();
