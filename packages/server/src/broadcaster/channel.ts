import { MediaStream, RTCDataChannel } from "wrtc";
import { EventEmitter } from "events";
import { XMLBuilder } from "fast-xml-parser";

import { Viewer } from "./viewer";

interface BackChannelMessage {
  viewerId?: string;
  message: any;
}

interface BroadcastMessage {
  message: any;
}

export class Channel extends EventEmitter {
  private channelId: string;
  private mediaStream: MediaStream;
  private dataChannel?: RTCDataChannel;
  private viewers: Map<string, Viewer>;
  private mpdXml: string;
  private preroll: string;

  constructor(channelId: string, mediaStream: MediaStream) {
    super();
    this.channelId = channelId;
    this.mediaStream = mediaStream;
    this.viewers = new Map();
    this.mpdXml;
  }

  private log(...args: any[]) {
    console.log(`[${this.channelId}]`, ...args);
  }

  assignBackChannel(dataChannel: RTCDataChannel) {
    this.log("Assigning backchannel", dataChannel);
    this.dataChannel = dataChannel;
  }

  assignPreRollMpd(mpdUrl: string) {
    this.preroll = mpdUrl;
  }

  addViewer(newViewer: Viewer) {
    this.viewers.set(newViewer.getId(), newViewer);
    this.log(`Add viewer ${newViewer.getId()} to ${this.channelId}, size ${this.viewers.size}`);
    this.onViewersChange();
  }

  removeViewer(viewerToRemove: Viewer) {
    this.viewers.delete(viewerToRemove.getId());
    this.onViewersChange();
  }

  onViewersChange() {
    this.sendMessageOnBackChannel({
      message: { event: "viewerschange", viewercount: this.viewers.size },
    });
    this.broadcastMessage("broadcaster", {
      message: { event: "viewerschange", viewercount: this.viewers.size },
    })
  }

  sendMessageOnBackChannel(message: BackChannelMessage) {
    if (!this.dataChannel) {
      this.log(`No backchannel found, not sending`);
      return;
    }    
    if (this.dataChannel.readyState !== "open") {
      this.log(`Backchannel not ready to receive, not sending`);
      return;
    }

    this.dataChannel.send(JSON.stringify(message));
  }

  broadcastMessage(channelLabel: string, message: BroadcastMessage) {
    this.viewers.forEach(viewer => {
      viewer.send(channelLabel, message);
    });
  }

  getViewers(): Viewer[] {
    return Array.from(this.viewers.values());
  }

  getViewer(viewerId: string): Viewer | undefined {
    if (!this.viewers.has(viewerId)) {
      return undefined;
    }
    return this.viewers.get(viewerId);
  }

  getStream(): MediaStream {
    return this.mediaStream;
  }

  getId(): string {
    return this.channelId;
  }

  generateMpdXml(link: string, rel: string) {
    const periods = [];

    if (this.preroll) {
      periods.push({
        "Period": {},
        ":@": {
          "@_xlink:href": this.preroll,
          "@_xlink:actuate": "onLoad" 
        },
      })
    }
    periods.push({
      "Period": [{
        "AdaptationSet": { },
        ":@": {
          "@_xlink:href": link,
          "@_xlink:rel": rel,
          "@_xlink:actuate": "onRequest"  
        }
      }],
    });

    const obj = [{
      "MPD": periods,
      ":@": {
        "@_profiles": "urn:mpeg:dash:profile:webrtc-live:2022",
        "@_type": "static",
        "@_xmlns": "urn:mpeg:dash:schema:mpd:2011",
        "@_xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "@_xmlns:xlink": "http://www.w3.org/1999/xlink",
        "@_xsi:schemaLocation": "urn:mpeg:DASH:schema:MPD:2011 DASH-MPD.xsd"
      }
    }];

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      preserveOrder: true,
    });
    const output = builder.build(obj);
    return output;
  }

  destroy() {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
  }
}