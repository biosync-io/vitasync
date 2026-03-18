import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { ChallengeService } from "../../services/challenge.service.js"
import { UserService } from "../../services/user.service.js"

const challengeService = new ChallengeService()
const userService = new UserService()

const challengesRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/challenges — list workspace challenges
  app.get("/", async (request, reply) => {
    const query = z
      .object({
        status: z.enum(["draft", "active", "completed", "cancelled"]).optional(),
        limit: z.coerce.number().min(1).max(100).default(20),
      })
      .parse(request.query)

    const challenges = await challengeService.list(request.workspaceId, query)
    return reply.send({ data: challenges })
  })

  // POST /v1/challenges — create a challenge
  app.post("/", async (request, reply) => {
    const body = z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        metricType: z.string().max(100),
        goalValue: z.number(),
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        maxParticipants: z.number().int().min(2).max(1000).optional(),
      })
      .parse(request.body)

    const challenge = await challengeService.create({
      workspaceId: request.workspaceId,
      createdBy: (request.body as any).createdBy ?? null,
      ...body,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      status: "draft",
    })
    return reply.status(201).send(challenge)
  })

  // GET /v1/challenges/:challengeId
  app.get("/:challengeId", async (request, reply) => {
    const { challengeId } = z.object({ challengeId: z.string().uuid() }).parse(request.params)
    const challenge = await challengeService.findById(challengeId, request.workspaceId)
    if (!challenge) return reply.status(404).send({ code: "NOT_FOUND", message: "Challenge not found" })
    return reply.send(challenge)
  })

  // POST /v1/challenges/:challengeId/join
  app.post("/:challengeId/join", async (request, reply) => {
    const { challengeId } = z.object({ challengeId: z.string().uuid() }).parse(request.params)
    const body = z.object({ userId: z.string().uuid() }).parse(request.body)

    const owner = await userService.findById(body.userId, request.workspaceId)
    if (!owner) return reply.status(404).send({ code: "NOT_FOUND", message: "User not found" })

    const participant = await challengeService.join(challengeId, body.userId)
    return reply.status(201).send(participant)
  })

  // POST /v1/challenges/:challengeId/leave
  app.post("/:challengeId/leave", async (request, reply) => {
    const { challengeId } = z.object({ challengeId: z.string().uuid() }).parse(request.params)
    const body = z.object({ userId: z.string().uuid() }).parse(request.body)

    await challengeService.leave(challengeId, body.userId)
    return reply.status(204).send()
  })

  // GET /v1/challenges/:challengeId/leaderboard
  app.get("/:challengeId/leaderboard", async (request, reply) => {
    const { challengeId } = z.object({ challengeId: z.string().uuid() }).parse(request.params)
    const leaderboard = await challengeService.leaderboard(challengeId)
    return reply.send({ data: leaderboard })
  })

  // POST /v1/challenges/:challengeId/activate
  app.post("/:challengeId/activate", async (request, reply) => {
    const { challengeId } = z.object({ challengeId: z.string().uuid() }).parse(request.params)
    const challenge = await challengeService.activate(challengeId, request.workspaceId)
    if (!challenge) return reply.status(404).send({ code: "NOT_FOUND", message: "Challenge not found" })
    return reply.send(challenge)
  })
}

export default challengesRoutes
