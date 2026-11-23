# --- Neuro-Symbolic Coder ProGuard Rules for Native Android Port ---
# Protect native JNI bridge classes and methods from R8 stripping/obfuscation
-keep class **NativeBridge { *; }
-keep class **.MainActivity { *; }

-keepclasseswithmembernames class * {
    native <methods>;
}

-keepclassmembers class * extends android.app.Service {
    <init>();
    public void onStartCommand(android.content.Intent, int, int);
}

-keepattributes Signature
-keepattributes *Annotation*
