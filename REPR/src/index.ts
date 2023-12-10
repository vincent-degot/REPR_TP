import { GUI } from 'dat.gui';
import { mat4, vec3, vec4, quat } from 'gl-matrix';
import { Camera } from './camera';
import { TriangleGeometry } from './geometries/triangle';
import { GLContext } from './gl';
import { PBRShader } from './shader/pbr-shader';
import { Texture, Texture2D } from './textures/texture';
import { UniformType } from './types';
import { SphereGeometry } from './geometries/sphere';
import { PointLight } from './lights/lights';

interface GUIProperties {
  albedo: number[];
  direct_diffuse: boolean;
  direct_specular: boolean;
  indirect_diffuse: boolean;
  indirect_specular: boolean;
}

/**
 * Class representing the current application with its state.
 *
 * @class Application
 */
class Application {
  /**
   * Context used to draw to the canvas
   *
   * @private
   */
  private _context: GLContext;

  private _shader: PBRShader;
  private _geometry: SphereGeometry;
  private _uniforms: Record<string, UniformType | Texture>;

  private _textureExample: Texture2D<HTMLElement> | null;
  private _textureSpecular: Texture2D<HTMLElement> | null;
  private _textureDiffuse: Texture2D<HTMLElement> | null;
  private _textureBRDF: Texture2D<HTMLElement> | null;

  private _camera: Camera;

  private _mouseClicked: boolean;
  private _mouseCurrentPosition: { x: number, y: number };

  private _pointLights: Array<PointLight>;
  /**
   * Object updated with the properties from the GUI
   *
   * @private
   */
  private _guiProperties: GUIProperties;

  constructor(canvas: HTMLCanvasElement) {
    this._context = new GLContext(canvas);
    this._camera = new Camera();
    vec3.set(this._camera.position, 0.0, 0.0, 20.0);

    this._mouseClicked = false;
    this._mouseCurrentPosition = { x: 0, y: 0 };

    this._geometry = new SphereGeometry();
    this._pointLights = new Array<PointLight>();
    this._pointLights.push(new PointLight().setColorRGB(255, 255, 255).setIntensity(1.0).setPosition(-6.0, -6.0, 8.0));
    this._pointLights.push(new PointLight().setColorRGB(255, 255, 255).setIntensity(1.0).setPosition(-6.0, 6.0, 8.0));
    this._pointLights.push(new PointLight().setColorRGB(255, 255, 255).setIntensity(1.0).setPosition(6.0, -6.0, 8.0));
    this._pointLights.push(new PointLight().setColorRGB(255, 255, 255).setIntensity(1.0).setPosition(6.0, 6.0, 8.0));
    this._nbLights = this._pointLights.length;

    this._uniforms = {
      'uMaterial.albedo': vec3.create(),
      'uMaterial.roughness': new Float32Array(1),
      'uMaterial.metalness': new Float32Array(1),
      'uCamera.WsToCs': mat4.create(),
      'uModel.translateVec': vec4.create(),
      'uPointLights.pos[0]': new Float32Array(this._nbLights * 3),
      'uPointLights.color[0]': new Float32Array(this._nbLights * 3),
      'uPointLights.intensity[0]': new Float32Array(this._nbLights),
      'uCameraPos': vec3.create(),
    };

    this._shader = new PBRShader();
    this._textureExample = null;
    this._textureSpecular = null;
    this._textureDiffuse = null;
    this._textureBRDF = null;

    this._guiProperties = {
      albedo: [255, 255, 255],
      direct_diffuse: true,
      direct_specular: true,
      indirect_diffuse: true,
      indirect_specular: true,
    };

    this._createGUI();
  }

  /**
   * Initializes the application.
   */
  async init() {
    this._context.uploadGeometry(this._geometry);
    this._context.compileProgram(this._shader);

    // Example showing how to load a texture and upload it to GPU.
    this._textureExample = await Texture2D.load(
      'assets/ggx-brdf-integrated.png'
    );
    if (this._textureExample !== null) {
      this._context.uploadTexture(this._textureExample);
      // You can then use it directly as a uniform:
      // ```uniforms.myTexture = this._textureExample;```
    }
    this._textureDiffuse = await Texture2D.load(
		    'assets/env/Alexs_Apt_2k-diffuse-RGBM.png'
		    );
    if (this._textureDiffuse !== null) {
	    this._context.uploadTexture(this._textureDiffuse);
	    this._uniforms['diffuseMap'] = this._textureDiffuse;
    }

    this._textureSpecular = await Texture2D.load(
		    'assets/env/Alexs_Apt_2k-specular-RGBM.png'
		    );
    if (this._textureSpecular !== null) {
	    this._context.uploadTexture(this._textureSpecular);
	    this._uniforms['specularMap'] = this._textureSpecular;
    }
    this._textureBRDF = await Texture2D.load(
		    'assets/ggx-brdf-integrated.png'
		    );
    if (this._textureBRDF !== null) {
	    this._context.uploadTexture(this._textureBRDF);
	    this._uniforms['BRDFMap'] = this._textureBRDF;
    }

    // Event handlers (mouse and keyboard)
    canvas.addEventListener('keydown', this.onKeyDown, true);
    canvas.addEventListener('pointerdown', this.onPointerDown, true);
    canvas.addEventListener('pointermove', this.onPointerMove, true);
    canvas.addEventListener('pointerup', this.onPointerUp, true);
    canvas.addEventListener('pointerleave', this.onPointerUp, true);
    for (let i = 0; i < this._nbLights; i++) {
            let slot = this._uniforms['uPointLights.pos[0]'] as Float32Array;
            slot[i * 3] = this._pointLights[i].positionWS[0];
	    slot[i * 3 + 1] = this._pointLights[i].positionWS[1];
            slot[i * 3 + 2] = this._pointLights[i].positionWS[2];

            let slot1 = this._uniforms['uPointLights.color[0]'] as Float32Array;
            slot1[i * 3] = this._pointLights[i].color[0] / 255;
            slot1[i * 3 + 1] = this._pointLights[i].color[1] / 255;
            slot1[i * 3 + 2] = this._pointLights[i].color[2] / 255;

            let slot2 = this._uniforms['uPointLights.intensity[0]'] as Float32Array;
            slot2[i * 3] = this._pointLights[i].intensity;
        }
  }

  /**
   * Called at every loop, before the [[Application.render]] method.
   */
  update() {
    /** Empty. */
  }

  /**
   * Called when the canvas size changes.
   */
  resize() {
    this._context.resize();
  }

  /**
   * Called at every loop, after the [[Application.update]] method.
   */
  render() {
    this._context.clear();
    this._context.setDepthTest(true);
    // this._context.setCulling(WebGL2RenderingContext.BACK);

    const props = this._guiProperties;

    // Set the color from the GUI into the uniform list.
    vec3.set(
      this._uniforms['uMaterial.albedo'] as vec3,
      props.albedo[0] / 255,
      props.albedo[1] / 255,
      props.albedo[2] / 255
    );
    this._uniforms['uToRender.DirD'] = props.direct_diffuse;
    this._uniforms['uToRender.DirS'] = props.direct_specular;
    this._uniforms['uToRender.IndD'] = props.indirect_diffuse;
    this._uniforms['uToRender.IndS'] = props.indirect_specular;

    vec3.set(this._uniforms['uCameraPos'] as vec3,
		    this._camera.position[0],
		    this._camera.position[1],
		    this._camera.position[2]
	    );
    // Sets the view projection matrix.
    const aspect = this._context.gl.drawingBufferWidth / this._context.gl.drawingBufferHeight;
    let WsToCs = this._uniforms['uCamera.WsToCs'] as mat4;
    mat4.multiply(WsToCs, this._camera.computeProjection(aspect), this._camera.computeView());

    // **Note**: if you want to modify the position of the geometry, you will
    // need to add a model matrix, corresponding to the mesh's matrix.

    // Draws the triangle.
    for (let i = 0; i < 5; i++) {
	    for (let j = 0; j < 5; j++) {
		    const TVec = new Float32Array(4);
		    TVec[ 0] = (i-2)*3; TVec[ 1] = (j-2) * 3;
		    TVec[ 2] = 0; TVec[ 3] = 0;
		    vec4.copy(this._uniforms['uModel.translateVec'] as vec4, TVec);
		    let roughness = this._uniforms['uMaterial.roughness'] as Float32Array;
		    roughness[0] = 0.05 + i * 0.232;
		    let metalness = this._uniforms['uMaterial.metalness'] as Float32Array;
		    metalness[0] = 0.0 + j * 0.24;
		    this._context.draw(this._geometry, this._shader, this._uniforms);
	    }
    }
  }

  /**
   * Creates a GUI floating on the upper right side of the page.
   *
   * ## Note
   *
   * You are free to do whatever you want with this GUI. It's useful to have
   * parameters you can dynamically change to see what happens.
   *
   *
   * @private
   */
  private _createGUI(): GUI {
    const gui = new GUI();
    gui.addColor(this._guiProperties, 'albedo');
    gui.add(this._guiProperties, 'direct_diffuse', true);
    gui.add(this._guiProperties, 'direct_specular', true);
    gui.add(this._guiProperties, 'indirect_diffuse', true);
    gui.add(this._guiProperties, 'indirect_specular', true);
    return gui;
  }

  /**
   * Handle keyboard and mouse inputs to translate and rotate camera.
   */
  onKeyDown(event: KeyboardEvent) {
    const speed = 0.2;

    let forwardVec = vec3.fromValues(0.0, 0.0, -speed);
    vec3.transformQuat(forwardVec, forwardVec, app._camera.rotation);
    let rightVec = vec3.fromValues(speed, 0.0, 0.0);
    vec3.transformQuat(rightVec, rightVec, app._camera.rotation);

    if (event.key == 'z' || event.key == 'ArrowUp') {
      vec3.add(app._camera.position, app._camera.position, forwardVec);
    }
    else if (event.key == 's' || event.key == 'ArrowDown') {
      vec3.add(app._camera.position, app._camera.position, vec3.negate(forwardVec, forwardVec));
    }
    else if (event.key == 'd' || event.key == 'ArrowRight') {
      vec3.add(app._camera.position, app._camera.position, rightVec);
    }
    else if (event.key == 'q' || event.key == 'ArrowLeft') {
      vec3.add(app._camera.position, app._camera.position, vec3.negate(rightVec, rightVec));
    }
  }

  onPointerDown(event: MouseEvent) {
    app._mouseCurrentPosition.x = event.clientX;
    app._mouseCurrentPosition.y = event.clientY;
    app._mouseClicked = true;
  }

  onPointerMove(event: MouseEvent) {
    if (!app._mouseClicked) {
      return;
    }

    const dx = event.clientX - app._mouseCurrentPosition.x;
    const dy = event.clientY - app._mouseCurrentPosition.y;
    const angleX = dy * 0.002;
    const angleY = dx * 0.002;
    quat.rotateX(app._camera.rotation, app._camera.rotation, angleX);
    quat.rotateY(app._camera.rotation, app._camera.rotation, angleY);

    app._mouseCurrentPosition.x = event.clientX;
    app._mouseCurrentPosition.y = event.clientY;
  }

  onPointerUp(event: MouseEvent) {
    app._mouseClicked = false;
  }

}

const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
const app = new Application(canvas as HTMLCanvasElement);
app.init();

function animate() {
  app.update();
  app.render();
  window.requestAnimationFrame(animate);
}
animate();

/**
 * Handles resize.
 */

const resizeObserver = new ResizeObserver((entries) => {
  if (entries.length > 0) {
    const entry = entries[0];
    canvas.width = window.devicePixelRatio * entry.contentRect.width;
    canvas.height = window.devicePixelRatio * entry.contentRect.height;
    app.resize();
  }
});

resizeObserver.observe(canvas);
