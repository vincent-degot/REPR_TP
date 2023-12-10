export default `
precision highp float;

in vec3 normal;
in vec3 pos;

out vec4 outFragColor;

struct Material
{
	vec3 albedo;
	float metalness;
	float roughness;
};
struct PointLight
{
	vec3 pos[4];
	vec3 color[4];
	float intensity[4];
};
struct ToRender
{
	bool DirD;
	bool DirS;
	bool IndD;
	bool IndS;
};

uniform vec3 uCameraPos;
uniform PointLight uPointLights;
uniform Material uMaterial;
uniform ToRender uToRender;

uniform sampler2D diffuseMap;
uniform sampler2D specularMap;
uniform sampler2D BRDFMap;

// Convert a unit cartesian vector to polar coordinates
vec2 cartesianToPolar(vec3 cartesian) {
	// Compute azimuthal angle, in [-PI, PI]
	float phi = atan(cartesian.z, cartesian.x);
	// Compute polar angle, in [-PI/2, PI/2]
	float theta = asin(cartesian.y);
	return vec2(phi, theta);
}

// From three.js
vec4 sRGBToLinear( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}

// From three.js
vec4 LinearTosRGB( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}

float PI = 3.141592654f;
float DGGX(vec3 n, vec3 h, float a)
{
	float NdotH = clamp(dot(n, h), 0.0001, 1.0);
	float NdotH2 = NdotH * NdotH;
	float a2 = a * a;
	float v = (NdotH2 * (a2 - 1.0f) + 1.0f);
	float v2 = v*v;
	return a2 / (PI * v2);
}
float SchlickGGX(vec3 n, vec3 v, float k)
{
	float NdotV = clamp(dot(n,v), 0.0001, 1.0);
	return NdotV / (NdotV * (1.0f - k) + k);
}
float G(vec3 n, vec3 v, vec3 l, float k)
{
	return SchlickGGX(n, v, k) * SchlickGGX(n, l, k);
}
float F0(float ior)
{
	return (ior - 1.0f) *(ior - 1.0f) / ((ior + 1.0f) * (ior + 1.0f));
}

vec3 Fshlick(vec3 v, vec3 h, vec3 f0)
{
	float val = 1.0f - clamp(dot(v,h), 0.0001, 1.0);
	float val5 = val * val * val * val * val;
	return f0 + (1.0f - f0) * val5;
}
float GetSpecular(vec3 dir, vec3 light, vec3 normal, vec3 h, float alpha, float metalness)
{
	float D = DGGX(normal, h, alpha);
	float k = (alpha + 1.0f) * (alpha + 1.0f) / 8.0f;
	float G = G(normal, dir, light, k);
	return (G*D) / (4.0f * clamp(dot(dir, normal), 0.0001, 1.0)
			       * clamp(dot(light, normal), 0.0001, 1.0));
}
vec3 GetDiffuse()
{
	return uMaterial.albedo/PI;
}
vec3 rgbmDecode(vec4 rgbm) {
  return 6.0 * rgbm.rgb * rgbm.a;
}
vec3 sampleDiffuseEnv(sampler2D tex, vec3 dir) {
  return rgbmDecode(texture(tex, cartesianToPolar(dir)));
}


vec3 textureLod(sampler2D tex, vec2 uv, float level) {
  vec2 map_uv = uv;
  float level2 = level * level;
  map_uv /= level2;
  map_uv.y /= 2.0;
  map_uv.y += 1.0 - (1.0 / level2);
  return rgbmDecode(texture(tex, map_uv));
}

vec3 sampleSpecularEnv(sampler2D tex, vec3 dir, float roughness) {
  vec2 coordinates = cartesianToPolar(dir);

  float prevLevel = floor(roughness * 5.0);
  float nextLevel = ceil(roughness * 5.0);
  float prevLevelNorm = prevLevel/5.0;
  float nextLevelNorm = nextLevel/5.0;
  vec3 prevLevelSample = textureLod(tex, coordinates, prevLevel);
  vec3 nextLevelSample = textureLod(tex, coordinates, nextLevel);
  
  vec3 ret = mix(prevLevelSample, nextLevelSample, roughness * 5.0 - prevLevel);
  return ret;
  
}

vec3 indirectSpecular(vec3 albedo, vec3 viewDirection, vec3 f0, vec3 ks, float alpha) {
	vec3 reflection = reflect(-viewDirection, normal);
	vec3 specularSample = sampleSpecularEnv(specularMap, reflection, alpha);
	float vDotN = clamp(dot(normal, viewDirection), 0.0001, 1.0);
	vec2 brdf_uv;
	brdf_uv.x = vDotN;
	brdf_uv.y = alpha;
	vec2 brdf = texture(BRDFMap, brdf_uv).rg;
	vec3 F =  ks * brdf.r + brdf.g;
	return specularSample * F;
}

vec3 Get_ind_irradiance(vec3 albedo, vec3 viewDirection,float metalness, float alpha) {
	vec3 f0 = mix(vec3(0.04), albedo, metalness);
	vec3 ks = Fshlick(viewDirection, normal, f0);
	vec3 kd = 1.0 - ks;

	vec3 diffuse = kd * (1.0 - metalness) * albedo * sampleDiffuseEnv(diffuseMap, normal);

	vec3 specular = indirectSpecular(albedo, viewDirection, f0, ks, alpha);
	vec3 ret = vec3(0.0);
	if (uToRender.IndD)
	{
		ret += diffuse;
	}
	if (uToRender.IndS)
	{
		ret += specular;
	}
	return ret;
}

vec3 GetIrradience(vec3 albedo)
{
	vec3 irradiance = vec3(0.0);
	float alpha = uMaterial.roughness;
	float metalness = uMaterial.metalness;
	vec3 dir = normalize(uCameraPos - pos);
	for (int i = 0; i < 4; ++i)
	{
		vec3 light_dir = normalize(uPointLights.pos[i] - pos);
		vec3 h = normalize(dir + light_dir);
		vec3 f0 = vec3(0.4);
		f0 = mix(f0, albedo, metalness);
		vec3 ks = Fshlick(light_dir, dir, f0);

		vec3 specular = ks * GetSpecular(dir, light_dir, 
				normal, h, alpha, metalness);
		
		vec3 diffuse = GetDiffuse();
		vec3 irradiance_i = vec3(0.0);
		diffuse *= (1.0 - metalness);
		if (uToRender.DirD)
		{
			irradiance_i += diffuse;
		}
		if (uToRender.DirS)
		{
			irradiance_i += specular;
		}
		irradiance += irradiance_i * uPointLights.color[i] * 
			clamp(dot(light_dir, normal), 0.0001, 1.0);
	}
	vec3 ind_irradiance = Get_ind_irradiance(albedo, dir, metalness, alpha);
	
	return irradiance + ind_irradiance;
}

void main()
{
	// **DO NOT** forget to do all your computation in linear space.

	// **DO NOT** forget to apply gamma correction as last step.
	vec3 albedo = sRGBToLinear(vec4(uMaterial.albedo, 1.0)).rgb;
	vec3 irradiance = GetIrradience(albedo);
	outFragColor.rgba = LinearTosRGB(vec4(irradiance, 1.0));
}
`;
