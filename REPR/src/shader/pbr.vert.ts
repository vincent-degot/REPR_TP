export default `

precision highp float;

in vec3 in_position;
in vec3 in_normal;
out vec3 normal;
out vec3 pos;

#ifdef USE_UV
  in vec2 in_uv;
#endif // USE_UV

/**
 * Varyings.
 */

out vec3 vWsNormal;
#ifdef USE_UV
  out vec2 vUv;
#endif // USE_UV

/**
 * Uniforms List
 */
struct Model
{
  vec4 translateVec;
};
uniform Model uModel;

struct Camera
{
  mat4 WsToCs; // World-Space to Clip-Space (proj * view)
};
uniform Camera uCamera;

void
main()
{
	normal = in_normal;
	pos = in_position + uModel.translateVec.xyz;
	vec4 positionLocal = uModel.translateVec + vec4(in_position, 1.0);
	gl_Position = uCamera.WsToCs * positionLocal;
}
`;
