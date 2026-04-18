import { Request, Response, NextFunction } from 'express';
import { 
  createOrderService, 
  getAllOrdersService, 
  getOrdersByCustomerService, 
  getOrderByIdService, 
  updateOrderStatusService,
  cancelOrderService 
} from './order.service.js';

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id; 
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const data = req.body;
    const order = await createOrderService(userId, data);
    res.status(201).json({ success: true, data: order });
    return;
  } catch (error: any) {
    next(error);
  }
};

export const getAllOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const searchTerm = req.query.searchTerm as string;

    const result = await getAllOrdersService(page, limit, searchTerm);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

export const getOrdersByCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const orders = await getOrdersByCustomerService(userId);
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

export const getOrderById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const userId = req.user?.id;
    const role = req.user?.role;

    const order = await getOrderByIdService(id, userId, role ? [role] : []);
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

export const updateOrderStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ success: false, message: 'Status is required' });
      return;
    }

    const order = await updateOrderStatusService(id, status);
    res.status(200).json({ success: true, data: order, message: 'Order status updated successfully' });
  } catch (error) {
    next(error);
  }
};

export const cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const order = await cancelOrderService(id, userId);
    res.status(200).json({ success: true, data: order, message: 'Order cancelled successfully' });
  } catch (error) {
    next(error);
  }
};

export const orderController = {
  createOrder,
  getAllOrders,
  getOrdersByCustomer,
  getOrderById,
  updateOrderStatus,
  cancelOrder
};
