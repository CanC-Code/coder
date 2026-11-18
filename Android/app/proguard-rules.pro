# --- Neuro-Symbolic Coder ProGuard Rules for Diddy Kong Racing ---
# Protect native JNI bridge classes and methods from R8 stripping/obfuscation
-keep class com.dkrwrapper.** { *; }

-keepclasseswithmembernames class * {
    native <methods>;
}

-keepclassmembers class * extends android.app.Service {
    <init>();
    public void onStartCommand(android.content.Intent, int, int);
}

-keepattributes Signature
-keepattributes *Annotation*
