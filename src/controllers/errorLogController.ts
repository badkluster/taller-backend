import { Request, Response } from 'express';
import ErrorLog from '../models/ErrorLog';

// @desc    Get error logs
// @route   GET /api/error-logs
// @access  Private/Admin
export const getErrorLogs = async (req: Request, res: Response) => {
  const pageSize = Number(req.query.pageSize) || 20;
  const page = Number(req.query.pageNumber) || 1;
  const keyword = req.query.keyword
    ? {
        $or: [
          { message: { $regex: req.query.keyword as string, $options: 'i' } },
          { path: { $regex: req.query.keyword as string, $options: 'i' } },
          { method: { $regex: req.query.keyword as string, $options: 'i' } },
        ],
      }
    : {};

  const count = await ErrorLog.countDocuments({ ...keyword });
  const logs = await ErrorLog.find({ ...keyword })
    .sort({ createdAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));

  res.json({ logs, page, pages: Math.ceil(count / pageSize), totalCount: count });
};

// @desc    Delete error log
// @route   DELETE /api/error-logs/:id
// @access  Private/Admin
export const deleteErrorLog = async (req: Request, res: Response) => {
  const log = await ErrorLog.findById(req.params.id);
  if (!log) {
    res.status(404);
    throw new Error('Log no encontrado');
  }
  await log.deleteOne();
  res.json({ message: 'Log eliminado' });
};
