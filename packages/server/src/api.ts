import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createWHIPResourceFromType, WHIPResourceParams } from "./factory";
import { WHIPResource, WHIPResourceICEServer } from "./models/WHIPResource";

type WHIPRequest = FastifyRequest<{ 
  Params: { 
    type: string;
    resourceId: string; 
  },
  Querystring: {
    channelId?: string;
    b64json?: string; // base64 encoded json
  }
}>

export default function(fastify: FastifyInstance, opts, done) {
  const API_KEY = process.env.NODE_ENV === "development" ? "devkey" : process.env.API_KEY;

  const addIceLinks = (iceServers: WHIPResourceICEServer[], auth): string[] => {
    if (API_KEY && iceServers.length > 0 && auth === API_KEY) {
      // Only include ICE server config when provided authorization key is correct
      let iceLinks = [];
      iceServers.forEach((ice) => {
        let iceLink = ice.urls + ";";
        iceLink += ` rel="ice-server";`;
        if (ice.username) {
          iceLink += ` username="${ice.username}";`;
        }
        if (ice.credential) {
          iceLink += ` credential: "${ice.credential}"; credential-type: "password";`;
        }
        iceLinks.push(iceLink);
      });
      return iceLinks;
    }
    return [];
  };

  const addProtocolExtensions = (resource: WHIPResource): string[] => {
    let extensions = resource.getProtocolExtensions();
    return extensions;
  };

  fastify.addContentTypeParser('application/sdp', { parseAs: "string" }, (req, body, done) => {
    done(null, body);
  })

  fastify.addContentTypeParser('application/trickle-ice-sdpfrag', { parseAs: "string" }, (req, body, done) => {
    done(null, body);
  })

  fastify.post("/whip/:type", {}, async (request: WHIPRequest, reply: FastifyReply) => {
    try {
      const type = request.params.type;
      const whipResourceParams = request.query;

      const resource = createWHIPResourceFromType(type, 
        whipResourceParams,
        <string>request.body, 
        opts.instance.getEnabledPlugins(), 
        opts.instance.getIceServers());
      opts.instance.addResource(resource);
      if (opts.instance.hasBroadcaster()) {
        resource.assignBroadcaster(opts.instance.getBroadcaster());
      }

      const sdpAnswer = await resource.sdpAnswer();

      reply.headers({
        "Content-Type": "application/sdp",
        "Location": `${opts.instance.getServerAddress()}${opts.prefix}/whip/${type}/${resource.getId()}`,
        "ETag": resource.getETag()
      });
      
      const links = addIceLinks(resource.getIceServers(), request.headers["authorization"])
        .concat(addProtocolExtensions(resource));
      reply.header("Link", links);
      reply.code(201).send(sdpAnswer);
    } catch (err) {
      console.error(err);
      reply.code(500).send(err.message);
    }
  });

  fastify.options("/whip/:type", {}, async (request: WHIPRequest, reply: FastifyReply) => {
    try {
      reply.header("Link", 
        addIceLinks(opts.instance.getIceServers(), request.headers["authorization"]));
      reply.code(204).send();            
    } catch (err) {
      console.error(err);
      reply.code(500).send(err.message);
    }
  });

  fastify.get("/whip", {}, async (request: WHIPRequest, reply: FastifyReply) => {
    try {
      reply.code(200).send(opts.instance.listResources().map(r => opts.prefix + "/whip/" + r.type + "/" + r.id));
    } catch (err) {
      console.error(err);
      reply.code(500).send(err.message);
    }
  });

  fastify.delete("/whip/:type/:resourceId", {}, async (request: WHIPRequest, reply: FastifyReply) => {
    const { resourceId } = request.params; 
    await opts.instance.deleteResource(resourceId);
    reply.code(200).send("OK");
  });

  fastify.patch("/whip/:type/:resourceId", {}, async (request: WHIPRequest, reply: FastifyReply) => {
    const { resourceId } = request.params; 
    const body = <string>request.body;

    try {
      const statusCode = await opts.instance.patchResource(resourceId, body, request.headers.etag);
      reply.code(statusCode).send();
    } catch {
      reply.code(500).send();
    }
  });

  fastify.get("/whip/:type/:resourceId", {}, async (request: WHIPRequest, reply: FastifyReply) => {
    reply.code(405).send("reserved");
  });

  fastify.head("/whip/:type/:resourceId", {}, async (request: WHIPRequest, reply: FastifyReply) => {
    reply.code(405).send("reserved");
  });

  fastify.post("/whip/:type/:resourceId", {}, async (request: WHIPRequest, reply: FastifyReply) => {
    reply.code(405).send("reserved");
  });

  fastify.put("/whip/:type/:resourceId", {}, async (request: WHIPRequest, reply: FastifyReply) => {
    reply.code(405).send("reserved");
  });

  done();
}
