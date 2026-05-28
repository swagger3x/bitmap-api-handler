import { Server, Socket } from "socket.io";

export default (io: Server, socket: Socket) => {
  socket.on("subscribeOrder", (orderId: string) => {
    console.log(`Socket ${socket.id} subscribed to order ${orderId}`);
    socket.join(`order_${orderId}`);
  });
};
