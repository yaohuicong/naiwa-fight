import Phaser from "phaser";
import { screenCam } from "../game/assets";

/** 第一关最远的天空层（场景-死巷-L0天空），固定不随镜头移动。 */
export class BackdropScene extends Phaser.Scene {
  constructor() {
    super("Backdrop");
  }

  create() {
    screenCam(this);
    this.add.image(0, 0, "st_sky").setOrigin(0);
  }
}
