varying highp vec3 x_worldPos;

void main()
{
//  // Fancy lighting, requires GL_OES_standard_derivatives, adds like 100 bytes.
//  vec3 i_normal = normalize(cross(dFdx(x_worldPos), dFdy(x_worldPos)));
//  vec3 i_fromLight = vec3(0,10,20)-x_worldPos;
//  gl_FragColor = vec4(vec3(99.*dot(normalize(i_fromLight),i_normal)) / pow(length(i_fromLight),2.), 1);

    float i_brightness = exp(-.1 * (length(vec3(0,10,20) - x_worldPos) - 9.));
    gl_FragColor = vec4(i_brightness*vec3(1,.5,1),1);
}