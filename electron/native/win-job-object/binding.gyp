{
  "conditions": [
    ["OS==\"win\"", {
      "targets": [
        {
          "target_name": "win_job_object",
          "sources": [ "src/win_job_object.cc" ],
          "include_dirs": [
            "<!@(node -p \"require('node-addon-api').include\")"
          ],
          "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
          "libraries": [ "-lkernel32" ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          }
        }
      ]
    }, {
      "targets": []
    }]
  ]
}
