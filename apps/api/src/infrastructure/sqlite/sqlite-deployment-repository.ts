import type { DatabaseSync } from "node:sqlite";

import type { Deployment, DeploymentStage, DeploymentStatus } from "@orqforge/shared";

import type { DeploymentRepository } from "../../domain/deployment-repository.js";

interface DeploymentRow {
  id: string;
  slug: string;
  source_kind: Deployment["sourceKind"];
  source_ref: string;
  status: DeploymentStatus;
  stage: DeploymentStage;
  image_tag: string | null;
  route_path: string | null;
  runtime_container_name: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteDeploymentRepository implements DeploymentRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(deployment: Deployment) {
    this.database
      .prepare(
        `
          INSERT INTO deployments (
            id,
            slug,
            source_kind,
            source_ref,
            status,
            stage,
            image_tag,
            route_path,
            runtime_container_name,
            failure_reason,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        deployment.id,
        deployment.slug,
        deployment.sourceKind,
        deployment.sourceRef,
        deployment.status,
        deployment.stage,
        deployment.imageTag,
        deployment.routePath,
        deployment.runtimeContainerName,
        deployment.failureReason,
        deployment.createdAt,
        deployment.updatedAt,
      );
  }

  list() {
    const rows = this.database
      .prepare(
        `
          SELECT
            id,
            slug,
            source_kind,
            source_ref,
            status,
            stage,
            image_tag,
            route_path,
            runtime_container_name,
            failure_reason,
            created_at,
            updated_at
          FROM deployments
          ORDER BY created_at DESC
        `,
      )
      .all() as unknown as DeploymentRow[];

    return rows.map(mapDeploymentRow);
  }

  findById(id: string) {
    const row = this.database
      .prepare(
        `
          SELECT
            id,
            slug,
            source_kind,
            source_ref,
            status,
            stage,
            image_tag,
            route_path,
            runtime_container_name,
            failure_reason,
            created_at,
            updated_at
          FROM deployments
          WHERE id = ?
        `,
      )
      .get(id) as DeploymentRow | undefined;

    return row ? mapDeploymentRow(row) : null;
  }

  update(deployment: Deployment) {
    this.database
      .prepare(
        `
          UPDATE deployments
          SET
            slug = ?,
            source_kind = ?,
            source_ref = ?,
            status = ?,
            stage = ?,
            image_tag = ?,
            route_path = ?,
            runtime_container_name = ?,
            failure_reason = ?,
            updated_at = ?
          WHERE id = ?
        `,
      )
      .run(
        deployment.slug,
        deployment.sourceKind,
        deployment.sourceRef,
        deployment.status,
        deployment.stage,
        deployment.imageTag,
        deployment.routePath,
        deployment.runtimeContainerName,
        deployment.failureReason,
        deployment.updatedAt,
        deployment.id,
      );
  }
}

function mapDeploymentRow(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    slug: row.slug,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    status: row.status,
    stage: row.stage,
    imageTag: row.image_tag,
    routePath: row.route_path,
    runtimeContainerName: row.runtime_container_name,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
