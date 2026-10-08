/**
 * «Видима броня» без окремих спрайтів: шейдер перефарбовує лише сталеві (сірі, малонасичені) пікселі лицаря
 * у колір рівня броні. Червона стрічка, шкіряна спідниця й білі спалахи удару лишаються як є.
 * Працює тільки у WebGL; у Canvas-рендері лицар просто лишається в рідній сталі.
 */
import Phaser from 'phaser';

const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec3 uColor;
uniform float uAmount;
varying vec2 outTexCoord;
void main() {
  vec4 c = texture2D(uMainSampler, outTexCoord);
  if (c.a <= 0.0 || uAmount <= 0.0) { gl_FragColor = c; return; }
  vec3 rgb = c.rgb / c.a;
  float mx = max(rgb.r, max(rgb.g, rgb.b));
  float mn = min(rgb.r, min(rgb.g, rgb.b));
  float sat = mx > 0.0 ? (mx - mn) / mx : 0.0;
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  // сталь: майже без насиченості, не чорні тіні й не білі спалахи
  float steel = (1.0 - smoothstep(0.15, 0.32, sat)) * smoothstep(0.18, 0.36, lum) * (1.0 - smoothstep(0.93, 1.0, lum));
  vec3 recol = min(uColor * (0.22 + lum * 1.15), vec3(1.0));
  rgb = mix(rgb, recol, steel * uAmount);
  gl_FragColor = vec4(rgb * c.a, c.a);
}
`;

export class ArmorPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  static readonly KEY = 'ArmorPipeline';
  color: readonly [number, number, number] = [1, 1, 1];
  amount = 0;

  constructor(game: Phaser.Game) {
    super({ game, name: ArmorPipeline.KEY, fragShader: FRAG });
  }

  onPreRender(): void {
    this.set3f('uColor', this.color[0], this.color[1], this.color[2]);
    this.set1f('uAmount', this.amount);
  }
}
