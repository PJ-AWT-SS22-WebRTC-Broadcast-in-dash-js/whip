import { WHIPClient, WHIPClientOptions } from "../../sdk/src/index";
import { getIceServers } from "./util";

let likesCount = 0;

function createWatchLink(channel) {
  const link = document.createElement("a");
  link.href = `watch.html?locator=${encodeURIComponent(channel.resource)}`;
  link.innerText = `Watch Channel`;
  link.target = "_blank";
  return link;
}

function createWebPlayerLink(channel) {
  const link = document.createElement("a");
  link.href = `https://web.player.eyevinn.technology?manifest=${encodeURIComponent(channel.resource)}`;
  link.innerText = `Watch in Eyevinn Web Player`;
  link.target = "_blank";
  return link;
}

async function getChannelUrl(client: WHIPClient): Promise<string> {
  let channelListUrl: string;
  (await client.getResourceExtensions()).forEach(link => {
    if (link.match(/rel=urn:ietf:params:whip:whpp-list/) || link.match(/rel=urn:ietf:params:whip:eyevinn-wrtc-channel-list/)) {
      const m = link.match(/<?([^>]*)>/);
      channelListUrl = m[1];
    }
  });
  return channelListUrl;
}

async function createClientItem(client: WHIPClient) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const extensions = document.createElement("ul");
  const deleteBtn = document.createElement("button");

  summary.innerText = await client.getResourceUrl();

  const channelListUrl = await getChannelUrl(client);

  const links = await client.getResourceExtensions();
  links.filter(v => v.match(/urn:ietf:params:whip:/) || v.match(/urn:mpeg:dash:schema:mpd/)).forEach(l => {
    const m = l.match(/<?([^>]*)>;\s*rel=([^;]*)/);
    if (m) {
      const [_, url, rel] = m;

      const link = document.createElement("li");
      link.innerHTML = `<a target="_blank" href="${url}">${url}</a> (${rel})`;
      extensions.appendChild(link);
    }
  });

  deleteBtn.innerText = "Delete";
  deleteBtn.onclick = async () => { 
    await client.destroy();
    details.parentNode?.removeChild(details);
    updateChannelList(channelListUrl);
  }

  details.appendChild(summary);
  details.appendChild(extensions);
  details.appendChild(deleteBtn);

  return details;
}

async function updateChannelList(channelListUrl?: string) {
  if (!channelListUrl) {
    return;
  }

  const channels = document.querySelector("#channels");
  channels.innerHTML = ""
  const response = await fetch(channelListUrl);
  if (response.ok) {
    const json = await response.json();
    if (json.length > 0) {
      json.map((channel) => {
        channels.appendChild(createWatchLink(channel));
        channels.appendChild(createWebPlayerLink(channel));
      });
    }
  }
}

async function ingest(client: WHIPClient, mediaStream: MediaStream) {
  const resources =
    document.querySelector<HTMLDivElement>("#resources");
  const videoIngest = document.querySelector<HTMLVideoElement>("video#ingest");

  videoIngest.srcObject = mediaStream;
  await client.ingest(mediaStream);

  resources.appendChild(await createClientItem(client));

  updateChannelList(await getChannelUrl(client));
  likesCount = 0;
}

function updateViewerCount(count) {  
  const viewers =
    document.querySelector<HTMLSpanElement>("#viewers");
  viewers.innerHTML = `${count} viewer${count > 1 ? "s" : ""}`;
}

function updateLikesCount(count) {
  const likes =
    document.querySelector<HTMLSpanElement>("#likes");
  likes.innerHTML = `${count} likes`;
}

function onMessage(data) {
  const json = JSON.parse(data);
  if (!json.message && !json.message.event) {
    return;
  }

  console.log(json.message);

  switch (json.message.event) {
    case "viewerschange":
      const viewers = json.message.viewercount;
      updateViewerCount(viewers);
      break;
    case "reaction":
      const reaction = json.message.reaction;
      if (reaction === "like") {
        likesCount++;
        updateLikesCount(likesCount);
      }
      break;
  }
}

async function createClient(url: string, iceConfigRemote: boolean, opts: WHIPClientOptions) {
  const client = new WHIPClient({
    endpoint: url,
    opts: opts,
  });
  if (iceConfigRemote) {
    await client.setIceServersFromEndpoint();
  }

  client.setupBackChannel();
  client.on("message", onMessage);

  return client;
}

window.addEventListener("DOMContentLoaded", async () => {

  const input = document.querySelector<HTMLInputElement>("#whip-endpoint");
  const ingestCamera =
    document.querySelector<HTMLButtonElement>("#ingest-camera");
  const ingestScreen =
    document.querySelector<HTMLButtonElement>("#ingest-screen");

  const paramChannelId =
    document.querySelector<HTMLInputElement>("#param-channel-id");

  const paramB64Json =
    document.querySelector<HTMLInputElement>("#param-b64json");

  let authkey;
  if (process.env.NODE_ENV === "development") {
    const protocol = process.env.TLS_TERMINATION_ENABLED ? "https" : "http";
    input.value = `${protocol}://${window.location.hostname}:8000/api/v1/whip/broadcaster`;
    authkey = "devkey";
  } else if (process.env.NODE_ENV === "awsdev") {
    input.value = "https://whip.dev.eyevinn.technology/api/v1/whip/broadcaster";
    authkey = process.env.API_KEY;
  } else {
    input.value = "https://broadcaster-whip.prod.eyevinn.technology/api/v1/whip/broadcaster";
    authkey = process.env.API_KEY;
  }

  const debug = process.env.NODE_ENV === "development" || !!process.env.DEBUG;
  const iceConfigRemote = !!(process.env.NODE_ENV === "development" || process.env.ICE_CONFIG_REMOTE);

  function updateThisUrl() {
    const url = new URL(window.location.href);
    input.value && url.searchParams.set("endpoint", input.value);
    document.querySelector<HTMLInputElement>("#thisurl").value = url.toString();
  }

  const url = new URL(window.location.href);
  if (url.searchParams.has("endpoint")) {
    input.value = url.searchParams.get("endpoint");
    const endpointUrl = new URL(input.value);
    paramChannelId.value = endpointUrl.searchParams.get("channelId");
    if (endpointUrl.searchParams.has("b64json")) {
      paramB64Json.value = Buffer.from(endpointUrl.searchParams.get("b64json"), "base64").toString();
    }
  }
  updateThisUrl();

  ingestCamera.addEventListener("click", async () => {
    const client = await createClient(input.value, iceConfigRemote, { 
      debug: debug, iceServers: getIceServers(), authkey: authkey }
    );
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    ingest(client, mediaStream);
  });

  ingestScreen.addEventListener("click", async () => {
    const client = await createClient(input.value, iceConfigRemote, { 
      debug: debug, iceServers: getIceServers(), authkey: authkey }
    );
    const mediaStream = await navigator.mediaDevices.getDisplayMedia();
    ingest(client, mediaStream);
  });

  paramChannelId.addEventListener("change", () => {
    const url = new URL(input.value);
    if (!paramChannelId.value) {
      url.searchParams.delete("channelId");
    } else {
      url.searchParams.set("channelId", paramChannelId.value);
    }
    input.value = url.toString();
    updateThisUrl();
  });

  paramB64Json.addEventListener("change", () => {
    const url = new URL(input.value);
    if (!paramB64Json.value) {
      url.searchParams.delete("b64json");
    } else {
      const b64json = Buffer.from(paramB64Json.value, "utf-8").toString("base64");
      url.searchParams.set("b64json", b64json);
    }
    input.value = url.toString();
    updateThisUrl();
  });

  input.addEventListener("change", () => {
    updateThisUrl();
  });
});
