#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/33fb6f7e9ed092ec8f9a7fa68a6d54731d1e0228d9e3d75375efdaa6da89031a/contract';
import endContract from '../../snapshots/33fb6f7e9ed092ec8f9a7fa68a6d54731d1e0228d9e3d75375efdaa6da89031a/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'ai_generation_logs',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('error_message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('input_json', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('output_json', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('prompt_id', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('prompt_version', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('user_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'ai_generation_logs_status_check_ef2e9b57',
            "\"status\" IN ('success', 'failure')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'daily_minimum_actions',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('minimum_action_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'daily_sop_tasks',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('daily_sop_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('order_index', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('task_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'daily_sops',
        columns: [
          col('completed_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('goal_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('stage_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'daily_sops_status_check_dbabbe3e',
            "\"status\" IN ('pending', 'completed')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'goals',
        columns: [
          col('completed_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('current_stage_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('expected_outcome', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('start_date', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('active'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('target_date', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('title', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'goals_status_check_bc8d8cc9',
            "\"status\" IN ('active', 'paused', 'completed', 'deleted')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'learning_paths',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('order_index', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('source_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('stage_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'learning_paths_source_type_check_64cb7b7d',
            "\"source_type\" IN ('user', 'ai')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'minimum_actions',
        columns: [
          col('completed_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('daily_sop_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('estimated_minutes', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('task_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'prompt_configs',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('input_schema', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('output_schema', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('prompt_id', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('rules', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('active'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('system_prompt', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('version', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'prompt_configs_status_check_11063666',
            "\"status\" IN ('active', 'inactive')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'stages',
        columns: [
          col('completed_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('duration_days', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('end_date', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('goal_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('order_index', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('start_date', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('not_started'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'stages_status_check_f5f18e63',
            "\"status\" IN ('not_started', 'in_progress', 'completed')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'tasks',
        columns: [
          col('completed_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('estimated_minutes', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('learning_path_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('order_index', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('stage_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('title', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('tasks_status_check_dbabbe3e', "\"status\" IN ('pending', 'completed')"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'users',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'daily_minimum_actions',
        constraint: 'daily_minimum_actions_user_id_date_key',
        columns: ['user_id', 'date'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'daily_sop_tasks',
        constraint: 'daily_sop_tasks_daily_sop_id_task_id_key',
        columns: ['daily_sop_id', 'task_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'daily_sops',
        constraint: 'daily_sops_goal_id_date_key',
        columns: ['goal_id', 'date'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'minimum_actions',
        constraint: 'minimum_actions_daily_sop_id_key',
        columns: ['daily_sop_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'prompt_configs',
        constraint: 'prompt_configs_prompt_id_version_key',
        columns: ['prompt_id', 'version'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ai_generation_logs',
        index: 'ai_generation_logs_prompt_id_idx_8d9359e9',
        columns: ['prompt_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ai_generation_logs',
        index: 'ai_generation_logs_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ai_generation_logs',
        index: 'ai_generation_logs_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'daily_minimum_actions',
        index: 'daily_minimum_actions_minimum_action_id_idx_323d7d46',
        columns: ['minimum_action_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'daily_minimum_actions',
        index: 'daily_minimum_actions_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'daily_sop_tasks',
        index: 'daily_sop_tasks_daily_sop_id_idx_69efce3a',
        columns: ['daily_sop_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'daily_sop_tasks',
        index: 'daily_sop_tasks_task_id_idx_5d5ac774',
        columns: ['task_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'daily_sops',
        index: 'daily_sops_date_idx_b4ca319c',
        columns: ['date'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'daily_sops',
        index: 'daily_sops_goal_id_idx_d91789ff',
        columns: ['goal_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'daily_sops',
        index: 'daily_sops_stage_id_idx_1ce9a73f',
        columns: ['stage_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'daily_sops',
        index: 'daily_sops_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'goals',
        index: 'goals_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'goals',
        index: 'goals_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'learning_paths',
        index: 'learning_paths_stage_id_idx_1ce9a73f',
        columns: ['stage_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'minimum_actions',
        index: 'minimum_actions_task_id_idx_5d5ac774',
        columns: ['task_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'prompt_configs',
        index: 'prompt_configs_prompt_id_idx_8d9359e9',
        columns: ['prompt_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'stages',
        index: 'stages_goal_id_idx_d91789ff',
        columns: ['goal_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'stages',
        index: 'stages_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'tasks',
        index: 'tasks_learning_path_id_idx_f51a42d6',
        columns: ['learning_path_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'tasks',
        index: 'tasks_stage_id_idx_1ce9a73f',
        columns: ['stage_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'tasks',
        index: 'tasks_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ai_generation_logs',
        foreignKey: {
          name: 'ai_generation_logs_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'daily_minimum_actions',
        foreignKey: {
          name: 'daily_minimum_actions_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'daily_minimum_actions',
        foreignKey: {
          name: 'daily_minimum_actions_minimum_action_id_fkey',
          columns: ['minimum_action_id'],
          references: { schema: 'public', table: 'minimum_actions', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'daily_sop_tasks',
        foreignKey: {
          name: 'daily_sop_tasks_daily_sop_id_fkey',
          columns: ['daily_sop_id'],
          references: { schema: 'public', table: 'daily_sops', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'daily_sop_tasks',
        foreignKey: {
          name: 'daily_sop_tasks_task_id_fkey',
          columns: ['task_id'],
          references: { schema: 'public', table: 'tasks', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'daily_sops',
        foreignKey: {
          name: 'daily_sops_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'daily_sops',
        foreignKey: {
          name: 'daily_sops_goal_id_fkey',
          columns: ['goal_id'],
          references: { schema: 'public', table: 'goals', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'daily_sops',
        foreignKey: {
          name: 'daily_sops_stage_id_fkey',
          columns: ['stage_id'],
          references: { schema: 'public', table: 'stages', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'goals',
        foreignKey: {
          name: 'goals_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'learning_paths',
        foreignKey: {
          name: 'learning_paths_stage_id_fkey',
          columns: ['stage_id'],
          references: { schema: 'public', table: 'stages', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'minimum_actions',
        foreignKey: {
          name: 'minimum_actions_daily_sop_id_fkey',
          columns: ['daily_sop_id'],
          references: { schema: 'public', table: 'daily_sops', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'minimum_actions',
        foreignKey: {
          name: 'minimum_actions_task_id_fkey',
          columns: ['task_id'],
          references: { schema: 'public', table: 'tasks', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'stages',
        foreignKey: {
          name: 'stages_goal_id_fkey',
          columns: ['goal_id'],
          references: { schema: 'public', table: 'goals', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'tasks',
        foreignKey: {
          name: 'tasks_stage_id_fkey',
          columns: ['stage_id'],
          references: { schema: 'public', table: 'stages', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'tasks',
        foreignKey: {
          name: 'tasks_learning_path_id_fkey',
          columns: ['learning_path_id'],
          references: { schema: 'public', table: 'learning_paths', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
