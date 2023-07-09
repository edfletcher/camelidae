const clocks = ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'];
const locUrl = new URL(window.location);
const { origin } = locUrl;
const endpoint = `${origin}/prompt`;
const button = document.getElementById('submit_prompt');
const clocksEle = document.getElementById('clocks');
const respEle = document.getElementById('response');
const respMetrics = document.getElementById('response_metrics');
const promptEle = document.getElementById('prompt');

function renderResponse (promptId, response) {
  clocksEle.parentElement.style.display = 'none';
  promptEle.value = response.prompt;
  const hadLineBreak = response.response.indexOf('\n') !== -1;
  respEle.setHTML(response.response
    .replaceAll('>', '&gt;')
    .replaceAll('<', '&lt;')
    .replaceAll('\n', '<br/>'));

  if (hadLineBreak) {
    respEle.setHTML(respEle.innerHTML.replaceAll(' ', '&nbsp;'));
  }

  document.getElementById('response_lbl').style.display = 'block';
  respMetrics.textContent = `Chewing through this response took the 🦙🐪🐫 ${Number(response.elapsed_ms / 1000).toFixed(0)} seconds ` +
        `(${Number(response.ms_per_token / 1000).toFixed(2)}/s per token)`;
  if (window.location.search.indexOf('?id') === -1) {
    window.location.search = `?id=${promptId}`;
  }
}

async function promptAndWait (prompt, endpoint, promptSuccessCb, waitTickCb, promptId, waitTimeSeconds = 5) {
  if (prompt && !promptId) {
    const promptRes = await fetch(endpoint, {
      method: 'POST',
      body: prompt
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

    promptId = (await promptRes.text()).trim();
  }

  const getUrl = `${endpoint}/${promptId}`;
  promptSuccessCb?.(promptId);

  let getStatus;
  let getResponse;
  do {
    const getRes = await fetch(getUrl);
    getStatus = getRes.status;
    waitTickCb?.();
    if (getStatus === 200) {
      getResponse = await getRes.json();
    }
    await new Promise((resolve) => setTimeout(resolve, waitTimeSeconds * 1000));
  } while (getStatus === 202);

  return [promptId, getResponse];
}

async function main () {
  if (locUrl.host.indexOf('-ht') !== -1) {
    const temp = document.getElementById('temp');
    temp.textContent = '🔥0.9🔥';
    temp.style.color = 'red';
    document.getElementById('header').textContent = document.title = button.textContent = `🔥${document.title}🔥`;
  }

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
        clocksEle.parentElement.style.display = 'block';
        const [promptId, response] = await promptAndWait(null, endpoint, firstTick, tick, curPromptId);
        renderResponse(promptId, response);
        return;
      }
    }
  }

  button.addEventListener('click', async () => {
    const prompt = promptEle.value;
    respMetrics.textContent = '';
    window.localStorage.setItem('prompt', prompt);
    const [promptId, response] = await promptAndWait(prompt, endpoint, firstTick, tick);
    renderResponse(promptId, response);
  });
}

main();
