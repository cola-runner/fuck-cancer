import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { cases } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import { GoogleDriveService } from "../lib/google-drive.js";
import { decrypt } from "../lib/encryption.js";

export async function casesRoutes(fastify: FastifyInstance): Promise<void> {
  // All case routes require authentication
  fastify.addHook("preHandler", authMiddleware);

  // List all cases for the current user
  fastify.get("/api/cases", async (request, reply) => {
    const userCases = await db
      .select()
      .from(cases)
      .where(eq(cases.userId, request.user.id))
      .orderBy(cases.createdAt);

    return reply.send({ cases: userCases });
  });

  // Get a single case
  fastify.get<{ Params: { id: string } }>(
    "/api/cases/:id",
    async (request, reply) => {
      const { id } = request.params;

      const [caseRecord] = await db
        .select()
        .from(cases)
        .where(and(eq(cases.id, id), eq(cases.userId, request.user.id)))
        .limit(1);

      if (!caseRecord) {
        return reply.code(404).send({ error: "Case not found" });
      }

      return reply.send({ case: caseRecord });
    }
  );

  // Create a new case + Google Drive folder
  fastify.post<{
    Body: { patientName: string; diagnosis?: string; notes?: string };
  }>("/api/cases", async (request, reply) => {
    const { patientName, diagnosis, notes } = request.body;

    if (!patientName) {
      return reply.code(400).send({ error: "patientName is required" });
    }

    // Create a Google Drive folder for the case if user has a Google token
    let driveFolderId: string | null = null;
    if (request.user.googleToken) {
      try {
        const tokens = JSON.parse(decrypt(request.user.googleToken));
        const driveService = new GoogleDriveService(tokens.access_token);
        const folderName = `FuckCancer - ${patientName}`;
        driveFolderId = await driveService.createFolder(folderName);
      } catch (err) {
        // Log but don't fail - Drive folder can be created later
        fastify.log.warn(
          { err },
          "Failed to create Google Drive folder for case"
        );
      }
    }

    const [newCase] = await db
      .insert(cases)
      .values({
        userId: request.user.id,
        patientName,
        diagnosis: diagnosis || null,
        notes: notes || null,
        driveFolderId,
      })
      .returning();

    return reply.code(201).send({ case: newCase });
  });

  // Update a case
  fastify.put<{
    Params: { id: string };
    Body: { patientName?: string; diagnosis?: string; notes?: string };
  }>("/api/cases/:id", async (request, reply) => {
    const { id } = request.params;
    const { patientName, diagnosis, notes } = request.body;

    // Verify ownership
    const [existing] = await db
      .select()
      .from(cases)
      .where(and(eq(cases.id, id), eq(cases.userId, request.user.id)))
      .limit(1);

    if (!existing) {
      return reply.code(404).send({ error: "Case not found" });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (patientName !== undefined) updateData.patientName = patientName;
    if (diagnosis !== undefined) updateData.diagnosis = diagnosis;
    if (notes !== undefined) updateData.notes = notes;

    const [updated] = await db
      .update(cases)
      .set(updateData)
      .where(eq(cases.id, id))
      .returning();

    return reply.send({ case: updated });
  });

  // Delete a case
  fastify.delete<{ Params: { id: string } }>(
    "/api/cases/:id",
    async (request, reply) => {
      const { id } = request.params;

      // Verify ownership
      const [existing] = await db
        .select()
        .from(cases)
        .where(and(eq(cases.id, id), eq(cases.userId, request.user.id)))
        .limit(1);

      if (!existing) {
        return reply.code(404).send({ error: "Case not found" });
      }

      // Optionally delete the Drive folder
      if (existing.driveFolderId && request.user.googleToken) {
        try {
          const tokens = JSON.parse(decrypt(request.user.googleToken));
          const driveService = new GoogleDriveService(tokens.access_token);
          await driveService.deleteFile(existing.driveFolderId);
        } catch (err) {
          fastify.log.warn(
            { err },
            "Failed to delete Google Drive folder for case"
          );
        }
      }

      await db.delete(cases).where(eq(cases.id, id));

      return reply.send({ success: true });
    }
  );
}
