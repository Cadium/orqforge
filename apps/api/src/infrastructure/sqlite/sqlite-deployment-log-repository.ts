import type { DatabaseSync } from "node:sqlite";

import type { DeploymentLogEntry, DeploymentStage } from "@orqforge/shared";

import type { DeploymentLogRepository } from "../../domain/deployment-log-repository.js";

interface DeploymentLogRow {
  deployment_id: string;
  seq: number;
  stage: DeploymentStage;
  stream: "stdout" | "stderr" | "system";
  message: string;
  created_at: string;
}

export class SqliteDeploymentLogRepository implements DeploymentLogRepository {
  constructor(private readonly database: DatabaseSync) {}

  append(log: Omit<DeploymentLogEntry, "seq">): DeploymentLogEntry {
    const nextSeq = this.getNextSequence(log.deploymentId);

    this.database
      .prepare(
        `
          INSERT INTO deployment_logs (
            deployment_id,
            seq,
            stage,
            stream,
            message,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        log.deploymentId,
        nextSeq,
        log.stage,
        log.stream,
        log.message,
        log.createdAt,
      );

    return {
      ...log,
      seq: nextSeq,
    };
  }

  listByDeploymentId(deploymentId: string) {
    const rows = this.database
      .prepare(
        `
          SELECT
            deployment_id,
            seq,
            stage,
            stream,
            message,
            created_at
          FROM deployment_logs
          WHERE deployment_id = ?
          ORDER BY seq ASC
        `,
      )
      .all(deploymentId) as unknown as DeploymentLogRow[];

    return rows.map(mapDeploymentLogRow);
  }

  private getNextSequence(deploymentId: string) {
    const row = this.database
      .prepare(
        `
          SELECT COALESCE(MAX(seq), 0) AS max_seq
          FROM deployment_logs
          WHERE deployment_id = ?
        `,
      )
      .get(deploymentId) as { max_seq: number };

    return row.max_seq + 1;
  }
}

function mapDeploymentLogRow(row: DeploymentLogRow): DeploymentLogEntry {
  return {
    deploymentId: row.deployment_id,
    seq: row.seq,
    stage: row.stage,
    stream: row.stream,
    message: row.message,
    createdAt: row.created_at,
  };
}
