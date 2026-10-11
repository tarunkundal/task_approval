import type {
  CreateCommentInput,
  CreateTaskInput,
  RejectTaskInput,
  TaskAction,
  TaskListQuery,
  UpdateTaskInput,
} from '@workspace/shared';
import type { Request, RequestHandler } from 'express';
import { requireUser } from '../middleware/authenticate.js';
import { parsedQuery } from '../middleware/validate.js';
import { addComment, listComments, listHistory } from '../services/task-activity.service.js';
import { transitionTask } from '../services/task-workflow.service.js';
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from '../services/tasks.service.js';

// Thin handlers: params, query and bodies are already validated by the route's middleware, and
// the actor always comes from `authenticate` (never from the request).

const taskId = (req: Request): string => req.params.id as string;

export const list: RequestHandler = async (req, res) => {
  res.status(200).json(await listTasks(requireUser(req), parsedQuery<TaskListQuery>(req)));
};

export const create: RequestHandler = async (req, res) => {
  res.status(201).json(await createTask(requireUser(req), req.body as CreateTaskInput));
};

export const get: RequestHandler = async (req, res) => {
  res.status(200).json(await getTask(requireUser(req), taskId(req)));
};

export const update: RequestHandler = async (req, res) => {
  res
    .status(200)
    .json(await updateTask(requireUser(req), taskId(req), req.body as UpdateTaskInput));
};

export const remove: RequestHandler = async (req, res) => {
  await deleteTask(requireUser(req), taskId(req));
  res.status(204).end();
};

/** POST /tasks/:id/{start,submit,approve}. */
export const transition =
  (action: Exclude<TaskAction, 'reject'>): RequestHandler =>
  async (req, res) => {
    res.status(200).json(await transitionTask(requireUser(req), taskId(req), action));
  };

/** POST /tasks/:id/reject — body `{ reason }` validated by `rejectTaskSchema`. */
export const reject: RequestHandler = async (req, res) => {
  const { reason } = req.body as RejectTaskInput;
  res.status(200).json(await transitionTask(requireUser(req), taskId(req), 'reject', reason));
};

export const comments: RequestHandler = async (req, res) => {
  res.status(200).json({ data: await listComments(requireUser(req), taskId(req)) });
};

export const comment: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json(await addComment(requireUser(req), taskId(req), req.body as CreateCommentInput));
};

export const history: RequestHandler = async (req, res) => {
  res.status(200).json({ data: await listHistory(requireUser(req), taskId(req)) });
};
