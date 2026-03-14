import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Colors, Radius, Spacing, Typography } from '../constants/Theme';
import { Heart, Mail, Lock } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async () => {
        if (!email || !password) {
            setError('Please enter both email and password.');
            return;
        }

        try {
            setLoading(true);
            setError('');
            await signInWithEmailAndPassword(auth, email, password);
            // On success, the auth state listener in index.tsx will pick it up, 
            // but we can also explicitly route back to index.
            router.replace('/');
        } catch (err: any) {
            console.error("Login failed:", err);
            setError(err.message || 'Failed to sign in.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={undefined}
            >
                <View style={styles.formContainer}>
                    <View style={styles.header}>
                        <View style={styles.iconContainer}>
                            <Heart size={48} color={Colors.dark.rose[500]} />
                        </View>
                        <Text style={styles.title}>Welcome Back</Text>
                        <Text style={styles.subtitle}>Enter your details to access your space.</Text>
                    </View>

                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Email</Text>
                        <View style={styles.inputWrapper}>
                            <Mail size={20} color={Colors.dark.mutedForeground} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="name@example.com"
                                placeholderTextColor={Colors.dark.mutedForeground}
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Password</Text>
                        <View style={styles.inputWrapper}>
                            <Lock size={20} color={Colors.dark.mutedForeground} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="••••••••"
                                placeholderTextColor={Colors.dark.mutedForeground}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                            />
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color={Colors.dark.foreground} />
                        ) : (
                            <Text style={styles.primaryButtonText}>Sign In</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Text style={styles.backButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020202', // Explicit dark background
    },
    keyboardView: {
        flex: 1,
        backgroundColor: '#020202', // Explicit dark background
    },
    formContainer: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: Spacing.xl,
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: Spacing.xxl,
    },
    iconContainer: {
        marginBottom: Spacing.lg,
    },
    title: {
        fontSize: 32,
        fontFamily: Typography.serifBold,
        color: Colors.dark.foreground,
        marginBottom: Spacing.xs,
    },
    subtitle: {
        fontSize: 15,
        fontFamily: Typography.sans,
        color: Colors.dark.mutedForeground,
        textAlign: 'center',
    },
    errorBox: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        padding: Spacing.md,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
        marginBottom: Spacing.lg,
    },
    errorText: {
        color: Colors.dark.rose[500],
        fontSize: 14,
        fontFamily: Typography.sans,
        textAlign: 'center',
    },
    inputGroup: {
        marginBottom: Spacing.lg,
    },
    label: {
        color: Colors.dark.foreground,
        fontSize: 14,
        fontFamily: Typography.sansBold,
        marginBottom: Spacing.xs,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.dark.input,
        borderWidth: 1,
        borderColor: Colors.dark.border,
        borderRadius: Radius.lg,
        paddingHorizontal: Spacing.md,
        height: 52,
    },
    inputIcon: {
        marginRight: Spacing.sm,
    },
    input: {
        flex: 1,
        color: Colors.dark.foreground,
        fontSize: 16,
        fontFamily: Typography.sans,
    },
    primaryButton: {
        backgroundColor: Colors.dark.rose[500],
        height: 52,
        borderRadius: Radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: Spacing.lg,
    },
    primaryButtonDisabled: {
        opacity: 0.7,
    },
    primaryButtonText: {
        color: Colors.dark.foreground,
        fontSize: 16,
        fontFamily: Typography.sansBold,
    },
    backButton: {
        marginTop: Spacing.lg,
        alignItems: 'center',
        paddingVertical: Spacing.sm,
    },
    backButtonText: {
        color: Colors.dark.mutedForeground,
        fontSize: 15,
        fontFamily: Typography.sans,
    }
});
