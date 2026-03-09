# Android Release Build Attempts

Date: 2026-03-08
Project: `native/`

## Attempt 1
Command:
`.\gradlew.bat assembleRelease`

Result:
- Failed immediately
- Error: `JAVA_HOME is not set and no 'java' command could be found in your PATH`

## Attempt 2
Command:
`$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:Path="$env:JAVA_HOME\bin;$env:Path"; $env:GRADLE_USER_HOME='C:\Users\Aryan\Desktop\orbit-v2\native\.gradle-user'; .\gradlew.bat assembleRelease`

Result:
- Gradle wrapper started
- Failed during cache workspace move:
`Could not move temporary workspace ...\groovy-dsl\...\ -> ...\groovy-dsl\...`

## Attempt 3
Command:
`$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:Path="$env:JAVA_HOME\bin;$env:Path"; $env:GRADLE_USER_HOME='C:\Users\Aryan\Desktop\orbit-v2\native\.gradle-user'; .\gradlew.bat --no-daemon assembleRelease`

Result:
- Same groovy-dsl workspace move failure

## Attempt 4
Command:
`Remove-Item ...\native\.gradle-user\caches\8.14.3\groovy-dsl\...; (retry assembleRelease)`

Result:
- Same groovy-dsl workspace move failure

## Attempt 5
Command:
`$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; $env:Path="$env:JAVA_HOME\bin;$env:Path"; $env:GRADLE_USER_HOME='C:\Users\Aryan\Desktop\orbit-v2\native\android\.gradle-user-local'; .\gradlew.bat --no-daemon --no-configuration-cache -Dorg.gradle.parallel=false assembleRelease`

Result:
- Downloaded Gradle 8.14.3 successfully
- Still failed with the same groovy-dsl workspace move error

## Current Build Blocker
- Environment-specific Gradle cache move failure:
`Could not move temporary workspace ...\groovy-dsl\<hash>-<tmp> -> ...\groovy-dsl\<hash>`
- Not resolved by cache path changes, cache cleanup, no-daemon, no-config-cache, or disabled parallel mode.
