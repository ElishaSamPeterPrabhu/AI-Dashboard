import { Module } from "@nestjs/common";
import { CanvasController } from "./canvas.controller";

@Module({
  controllers: [CanvasController],
})
export class CanvasModule {}
